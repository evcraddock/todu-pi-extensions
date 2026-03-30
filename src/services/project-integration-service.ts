import type { ProjectSummary, TaskPriority } from "../domain/task";
import type { ProjectService } from "./project-service";
import type { RepoContextService, ResolvedRepositoryContext } from "./repo-context";

export type IntegrationSyncStrategy = "bidirectional" | "pull" | "push" | "none";

export interface IntegrationBinding {
  id: string;
  provider: string;
  projectId: string;
  targetKind: string;
  targetRef: string;
  strategy: IntegrationSyncStrategy;
  enabled: boolean;
  options?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationBindingInput {
  provider: string;
  projectId: string;
  targetKind: string;
  targetRef: string;
  strategy?: IntegrationSyncStrategy;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface IntegrationBindingFilter {
  provider?: string;
  projectId?: string;
  enabled?: boolean;
}

export type RepositoryBindingCheckResult =
  | {
      kind: "registered";
      repository: ResolvedRepositoryContext;
      binding: IntegrationBinding;
      project: ProjectSummary | null;
    }
  | {
      kind: "not-registered";
      repository: ResolvedRepositoryContext;
    }
  | {
      kind: "ambiguous";
      reason: "multiple-remotes" | "multiple-matching-bindings";
      repositoryPath?: string;
      repository?: ResolvedRepositoryContext;
      remotes?: string[];
      bindings?: IntegrationBinding[];
    }
  | {
      kind: "missing-context";
      reason: "not-a-git-repository" | "no-remotes";
      repositoryPath?: string;
    }
  | {
      kind: "unsupported";
      reason: "unsupported-remote-format";
      repositoryPath?: string;
      remoteName: string;
      remoteUrl: string;
    };

export type RepositoryProjectRegistrationResult =
  | {
      kind: "registered";
      repository: ResolvedRepositoryContext;
      project: ProjectSummary;
      binding: IntegrationBinding;
      createdProject: boolean;
      createdBinding: boolean;
    }
  | {
      kind: "already-registered";
      repository: ResolvedRepositoryContext;
      binding: IntegrationBinding;
      project: ProjectSummary | null;
    }
  | RepositoryBindingCheckResult;

export interface RegisterRepositoryProjectInput {
  projectName?: string;
  repositoryPath?: string;
  provider?: string;
  targetRef?: string;
  description?: string | null;
  priority?: TaskPriority;
  strategy?: IntegrationSyncStrategy;
  enabled?: boolean;
}

export interface ProjectIntegrationService {
  listIntegrationBindings(filter?: IntegrationBindingFilter): Promise<IntegrationBinding[]>;
  checkRepositoryBinding(input?: {
    repositoryPath?: string;
    provider?: string;
    targetRef?: string;
  }): Promise<RepositoryBindingCheckResult>;
  registerRepositoryProject(
    input: RegisterRepositoryProjectInput
  ): Promise<RepositoryProjectRegistrationResult>;
}

export interface ProjectIntegrationGateway {
  listIntegrationBindings(filter?: IntegrationBindingFilter): Promise<IntegrationBinding[]>;
  createIntegrationBinding(input: CreateIntegrationBindingInput): Promise<IntegrationBinding>;
}

export interface ProjectIntegrationServiceDependencies {
  projectService: ProjectService;
  repoContextService: RepoContextService;
  gateway: ProjectIntegrationGateway;
}

const createProjectIntegrationService = ({
  projectService,
  repoContextService,
  gateway,
}: ProjectIntegrationServiceDependencies): ProjectIntegrationService => ({
  listIntegrationBindings: (filter) => gateway.listIntegrationBindings(filter),
  checkRepositoryBinding: async (input = {}) => {
    const repositoryResolution = await resolveRepositoryInput(repoContextService, input);
    if (repositoryResolution.kind !== "resolved") {
      return repositoryResolution;
    }

    const matches = await findMatchingBindings(gateway, repositoryResolution.repository);
    if (matches.length === 0) {
      return {
        kind: "not-registered",
        repository: repositoryResolution.repository,
      };
    }

    if (matches.length > 1) {
      return {
        kind: "ambiguous",
        reason: "multiple-matching-bindings",
        repository: repositoryResolution.repository,
        bindings: matches,
      };
    }

    const binding = matches[0];
    return {
      kind: "registered",
      repository: repositoryResolution.repository,
      binding,
      project: binding ? await projectService.getProject(binding.projectId) : null,
    };
  },
  registerRepositoryProject: async (input) => {
    const repositoryResolution = await resolveRepositoryInput(repoContextService, input);
    if (repositoryResolution.kind !== "resolved") {
      return repositoryResolution;
    }

    const checkResult = await createProjectIntegrationService({
      projectService,
      repoContextService,
      gateway,
    }).checkRepositoryBinding({
      repositoryPath: repositoryResolution.repository.repositoryPath,
      provider: repositoryResolution.repository.provider,
      targetRef: repositoryResolution.repository.targetRef,
    });

    if (checkResult.kind === "registered") {
      return {
        kind: "already-registered",
        repository: checkResult.repository,
        binding: checkResult.binding,
        project: checkResult.project,
      };
    }

    if (checkResult.kind !== "not-registered") {
      return checkResult;
    }

    const project = await projectService.createProject({
      name: normalizeProjectName(input.projectName, checkResult.repository.targetRef),
      description: input.description,
      priority: input.priority,
    });
    const binding = await gateway.createIntegrationBinding({
      provider: checkResult.repository.provider,
      projectId: project.id,
      targetKind: "repository",
      targetRef: checkResult.repository.targetRef,
      strategy: input.strategy,
      enabled: input.enabled,
    });

    return {
      kind: "registered",
      repository: checkResult.repository,
      project,
      binding,
      createdProject: true,
      createdBinding: true,
    };
  },
});

const resolveRepositoryInput = async (
  repoContextService: RepoContextService,
  input: { repositoryPath?: string; provider?: string; targetRef?: string }
): Promise<
  RepositoryBindingCheckResult | { kind: "resolved"; repository: ResolvedRepositoryContext }
> => {
  const repoResult = await repoContextService.resolveRepository({
    repositoryPath: input.repositoryPath,
  });
  if (repoResult.kind === "resolved") {
    return {
      kind: "resolved",
      repository: {
        ...repoResult.repository,
        provider:
          (input.provider as ResolvedRepositoryContext["provider"] | undefined) ??
          repoResult.repository.provider,
        targetRef: input.targetRef ?? repoResult.repository.targetRef,
      },
    };
  }

  if (input.provider && input.targetRef) {
    return {
      kind: "resolved",
      repository: {
        repositoryPath: input.repositoryPath ?? process.cwd(),
        remoteName: "explicit",
        remoteUrl: "explicit",
        provider: input.provider as ResolvedRepositoryContext["provider"],
        targetRef: input.targetRef,
      },
    };
  }

  return repoResult;
};

const findMatchingBindings = async (
  gateway: ProjectIntegrationGateway,
  repository: ResolvedRepositoryContext
): Promise<IntegrationBinding[]> => {
  const bindings = await gateway.listIntegrationBindings({ provider: repository.provider });
  return bindings.filter(
    (binding) =>
      binding.provider === repository.provider &&
      binding.targetKind === "repository" &&
      binding.targetRef === repository.targetRef
  );
};

const normalizeProjectName = (projectName: string | undefined, targetRef: string): string => {
  const trimmedName = projectName?.trim();
  if (trimmedName && trimmedName.length > 0) {
    return trimmedName;
  }

  const segments = targetRef.split("/");
  return segments[segments.length - 1] ?? targetRef;
};

export {
  createProjectIntegrationService,
  findMatchingBindings,
  normalizeProjectName,
  resolveRepositoryInput,
};
