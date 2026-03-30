import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { ProjectSummary, TaskPriority } from "../domain/task";
import type {
  IntegrationBinding,
  ProjectIntegrationService,
  RegisterRepositoryProjectInput,
  RepositoryBindingCheckResult,
  RepositoryProjectRegistrationResult,
} from "../services/project-integration-service";
import type { ProjectService } from "../services/project-service";
import type { ResolvedRepositoryContext } from "../services/repo-context";
import { ToduProjectIntegrationServiceError } from "../services/todu/todu-project-integration-service";
import { ToduProjectServiceError } from "../services/todu/todu-project-service";

const PROJECT_PRIORITY_VALUES = ["low", "medium", "high"] as const;

const ProjectCheckParams = Type.Object({
  repositoryPath: Type.Optional(Type.String({ description: "Optional repository path override" })),
  provider: Type.Optional(Type.String({ description: "Optional explicit repository provider" })),
  targetRef: Type.Optional(
    Type.String({ description: "Optional explicit repository target reference, like owner/repo" })
  ),
});

const ProjectRegisterParams = Type.Object({
  projectName: Type.Optional(Type.String({ description: "Optional project name override" })),
  repositoryPath: Type.Optional(Type.String({ description: "Optional repository path override" })),
  provider: Type.Optional(Type.String({ description: "Optional explicit repository provider" })),
  targetRef: Type.Optional(
    Type.String({ description: "Optional explicit repository target reference, like owner/repo" })
  ),
  description: Type.Optional(Type.String({ description: "Optional project description" })),
  priority: Type.Optional(
    StringEnum(PROJECT_PRIORITY_VALUES, { description: "Optional project priority" })
  ),
});

interface ProjectCheckToolParams {
  repositoryPath?: string;
  provider?: string;
  targetRef?: string;
}

interface ProjectRegisterToolParams extends ProjectCheckToolParams {
  projectName?: string;
  description?: string;
  priority?: TaskPriority;
}

interface ProjectCheckToolDetails {
  kind: "project_check";
  state: "registered" | "not-registered" | "ambiguous" | "missing-context" | "unsupported";
  repositoryPath?: string;
  repository?: ResolvedRepositoryContext;
  reason?: string;
  project?: ProjectSummary | null;
  binding?: IntegrationBinding;
  bindings?: IntegrationBinding[];
  remotes?: string[];
}

interface ProjectRegisterToolDetails {
  kind: "project_register";
  state:
    | "registered"
    | "already-registered"
    | "name-conflict"
    | "ambiguous"
    | "missing-context"
    | "unsupported";
  repositoryPath?: string;
  repository?: ResolvedRepositoryContext;
  project?: ProjectSummary | null;
  binding?: IntegrationBinding;
  createdProject?: boolean;
  createdBinding?: boolean;
  conflictingProjects?: ProjectSummary[];
  reason?: string;
  remotes?: string[];
  bindings?: IntegrationBinding[];
}

interface ProjectIntegrationToolDependencies {
  getProjectIntegrationService: () => Promise<ProjectIntegrationService>;
  getProjectService: () => Promise<ProjectService>;
}

const createProjectCheckToolDefinition = ({
  getProjectIntegrationService,
}: Pick<ProjectIntegrationToolDependencies, "getProjectIntegrationService">) => ({
  name: "project_check",
  label: "Project Check",
  description: "Check whether a repository is registered to a project.",
  promptSnippet:
    "Check whether a repository is registered through the integration-aware project service.",
  promptGuidelines: [
    "Use this tool for repository-aware registration checks in normal chat.",
    "Keep project_check read-only and return explicit registered, not-registered, or ambiguous states.",
    "Explicit repositoryPath, provider, and targetRef inputs override ambient repo detection where applicable.",
  ],
  parameters: ProjectCheckParams,
  async execute(_toolCallId: string, params: ProjectCheckToolParams) {
    try {
      const input = normalizeProjectCheckInput(params);
      const projectIntegrationService = await getProjectIntegrationService();
      const result = await projectIntegrationService.checkRepositoryBinding(input);
      const details = mapProjectCheckDetails(result, input.repositoryPath);

      return {
        content: [{ type: "text" as const, text: formatProjectCheckContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "project_check failed"), { cause: error });
    }
  },
});

const createProjectRegisterToolDefinition = ({
  getProjectIntegrationService,
  getProjectService,
}: ProjectIntegrationToolDependencies) => ({
  name: "project_register",
  label: "Project Register",
  description: "Register a repository-backed project through integration-aware services.",
  promptSnippet:
    "Register a repository-backed project without collapsing repo registration into plain project_create.",
  promptGuidelines: [
    "Use this tool only for repository-aware project registration in normal chat.",
    "Do not use project_register as a synonym for plain local project_create.",
    "Report name conflicts, duplicate bindings, ambiguous remotes, and missing repository context explicitly.",
    "Explicit repositoryPath, provider, and targetRef inputs override ambient repo detection where applicable.",
  ],
  parameters: ProjectRegisterParams,
  async execute(_toolCallId: string, params: ProjectRegisterToolParams) {
    try {
      const input = normalizeProjectRegisterInput(params);
      const projectIntegrationService = await getProjectIntegrationService();
      const initialCheck = await projectIntegrationService.checkRepositoryBinding(input);
      const nameConflict =
        initialCheck.kind === "not-registered"
          ? await findProjectNameConflict(getProjectService, input, initialCheck)
          : null;

      if (nameConflict) {
        const details: ProjectRegisterToolDetails = {
          kind: "project_register",
          state: "name-conflict",
          repositoryPath: input.repositoryPath,
          repository: initialCheck.kind === "not-registered" ? initialCheck.repository : undefined,
          conflictingProjects: nameConflict,
          reason: "project-name-conflict",
        };

        return {
          content: [{ type: "text" as const, text: formatProjectRegisterContent(details) }],
          details,
        };
      }

      const result = await projectIntegrationService.registerRepositoryProject(input);
      const details = mapProjectRegisterDetails(result, input.repositoryPath);

      return {
        content: [{ type: "text" as const, text: formatProjectRegisterContent(details) }],
        details,
      };
    } catch (error) {
      if (isProjectConflictError(error)) {
        const details: ProjectRegisterToolDetails = {
          kind: "project_register",
          state: "name-conflict",
          repositoryPath: params.repositoryPath?.trim() || undefined,
          conflictingProjects: [],
          reason: error.message,
        };

        return {
          content: [{ type: "text" as const, text: formatProjectRegisterContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "project_register failed"), { cause: error });
    }
  },
});

const registerProjectIntegrationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: ProjectIntegrationToolDependencies
): void => {
  pi.registerTool(createProjectCheckToolDefinition(dependencies));
  pi.registerTool(createProjectRegisterToolDefinition(dependencies));
};

const normalizeProjectCheckInput = (params: ProjectCheckToolParams): ProjectCheckToolParams => ({
  repositoryPath: normalizeOptionalText(params.repositoryPath),
  provider: normalizeOptionalText(params.provider),
  targetRef: normalizeOptionalText(params.targetRef),
});

const normalizeProjectRegisterInput = (
  params: ProjectRegisterToolParams
): RegisterRepositoryProjectInput => ({
  projectName: normalizeOptionalText(params.projectName),
  repositoryPath: normalizeOptionalText(params.repositoryPath),
  provider: normalizeOptionalText(params.provider),
  targetRef: normalizeOptionalText(params.targetRef),
  description: hasOwn(params, "description")
    ? normalizeNullableText(params.description)
    : undefined,
  priority: params.priority,
});

const mapProjectCheckDetails = (
  result: RepositoryBindingCheckResult,
  repositoryPath?: string
): ProjectCheckToolDetails => {
  switch (result.kind) {
    case "registered":
      return {
        kind: "project_check",
        state: "registered",
        repositoryPath,
        repository: result.repository,
        project: result.project,
        binding: result.binding,
      };
    case "not-registered":
      return {
        kind: "project_check",
        state: "not-registered",
        repositoryPath,
        repository: result.repository,
      };
    case "ambiguous":
      return {
        kind: "project_check",
        state: "ambiguous",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        repository: result.repository,
        bindings: result.bindings,
        remotes: result.remotes,
        reason: result.reason,
      };
    case "missing-context":
      return {
        kind: "project_check",
        state: "missing-context",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        reason: result.reason,
      };
    case "unsupported":
      return {
        kind: "project_check",
        state: "unsupported",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        reason: result.reason,
      };
  }
};

const mapProjectRegisterDetails = (
  result: RepositoryProjectRegistrationResult,
  repositoryPath?: string
): ProjectRegisterToolDetails => {
  if (result.kind === "registered" && "createdProject" in result) {
    return {
      kind: "project_register",
      state: "registered",
      repositoryPath,
      repository: result.repository,
      project: result.project,
      binding: result.binding,
      createdProject: result.createdProject,
      createdBinding: result.createdBinding,
    };
  }

  switch (result.kind) {
    case "already-registered":
      return {
        kind: "project_register",
        state: "already-registered",
        repositoryPath,
        repository: result.repository,
        project: result.project,
        binding: result.binding,
      };
    case "ambiguous":
      return {
        kind: "project_register",
        state: "ambiguous",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        repository: result.repository,
        bindings: result.bindings,
        remotes: result.remotes,
        reason: result.reason,
      };
    case "missing-context":
      return {
        kind: "project_register",
        state: "missing-context",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        reason: result.reason,
      };
    case "unsupported":
      return {
        kind: "project_register",
        state: "unsupported",
        repositoryPath: result.repositoryPath ?? repositoryPath,
        reason: result.reason,
      };
    case "not-registered":
      return {
        kind: "project_register",
        state: "missing-context",
        repositoryPath,
        repository: result.repository,
        reason: "not-registered",
      };
    case "registered":
      return {
        kind: "project_register",
        state: "already-registered",
        repositoryPath,
        repository: result.repository,
        project: result.project,
        binding: result.binding,
      };
  }
};

const findProjectNameConflict = async (
  getProjectService: () => Promise<ProjectService>,
  input: RegisterRepositoryProjectInput,
  result: Extract<RepositoryBindingCheckResult, { kind: "not-registered" }>
): Promise<ProjectSummary[] | null> => {
  const requestedName = normalizeProjectRegisterName(
    input.projectName,
    result.repository.targetRef
  );
  const projectService = await getProjectService();
  const projects = await projectService.listProjects();
  const matches = projects.filter((project) => project.name === requestedName);
  return matches.length > 0 ? matches : null;
};

const normalizeProjectRegisterName = (
  projectName: string | undefined,
  targetRef: string
): string => {
  const trimmedName = projectName?.trim();
  if (trimmedName && trimmedName.length > 0) {
    return trimmedName;
  }

  const segments = targetRef.split("/");
  return segments[segments.length - 1] ?? targetRef;
};

const formatProjectCheckContent = (details: ProjectCheckToolDetails): string => {
  switch (details.state) {
    case "registered":
      return [
        "Registration: Registered",
        `Project: ${details.project?.name ?? details.binding?.projectId ?? "(missing project)"}`,
        `Provider: ${details.repository?.provider ?? "-"}`,
        `Repository: ${details.repository?.targetRef ?? "-"}`,
        `Integration ID: ${details.binding?.id ?? "-"}`,
      ].join("\n");
    case "not-registered":
      return [
        "Registration: Not Registered",
        `Provider: ${details.repository?.provider ?? "-"}`,
        `Repository: ${details.repository?.targetRef ?? "-"}`,
        "Integration ID: -",
      ].join("\n");
    case "ambiguous":
      return [
        "Registration: Ambiguous",
        `Reason: ${details.reason ?? "ambiguous"}`,
        details.remotes ? `Remotes: ${details.remotes.join(", ")}` : null,
        details.bindings
          ? `Matching Bindings: ${details.bindings.map((binding) => binding.id).join(", ")}`
          : null,
      ]
        .filter((value): value is string => value !== null)
        .join("\n");
    case "missing-context":
      return `Registration: Missing Repository Context\nReason: ${details.reason ?? "missing-context"}`;
    case "unsupported":
      return `Registration: Unsupported Repository Remote\nReason: ${details.reason ?? "unsupported-remote-format"}`;
  }
};

const formatProjectRegisterContent = (details: ProjectRegisterToolDetails): string => {
  switch (details.state) {
    case "registered":
      return [
        `Registered project ${details.project?.id ?? "-"}: ${details.project?.name ?? "-"}`,
        `Provider: ${details.repository?.provider ?? "-"}`,
        `Repository: ${details.repository?.targetRef ?? "-"}`,
        `Integration ID: ${details.binding?.id ?? "-"}`,
      ].join("\n");
    case "already-registered":
      return [
        "Repository is already registered.",
        `Project: ${details.project?.name ?? details.binding?.projectId ?? "(missing project)"}`,
        `Provider: ${details.repository?.provider ?? "-"}`,
        `Repository: ${details.repository?.targetRef ?? "-"}`,
      ].join("\n");
    case "name-conflict":
      return [
        "Repository registration blocked by project name conflict.",
        details.conflictingProjects && details.conflictingProjects.length > 0
          ? `Conflicting Projects: ${details.conflictingProjects.map((project) => `${project.id} (${project.name})`).join(", ")}`
          : null,
        details.reason ? `Reason: ${details.reason}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join("\n");
    case "ambiguous":
      return [
        "Repository registration is ambiguous.",
        `Reason: ${details.reason ?? "ambiguous"}`,
        details.remotes ? `Remotes: ${details.remotes.join(", ")}` : null,
        details.bindings
          ? `Matching Bindings: ${details.bindings.map((binding) => binding.id).join(", ")}`
          : null,
      ]
        .filter((value): value is string => value !== null)
        .join("\n");
    case "missing-context":
      return `Repository registration requires repository context.\nReason: ${details.reason ?? "missing-context"}`;
    case "unsupported":
      return `Repository registration failed for an unsupported remote.\nReason: ${details.reason ?? "unsupported-remote-format"}`;
  }
};

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
};

const normalizeNullableText = (value: string | undefined): string | null => {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const hasOwn = <TObject extends object>(value: TObject, property: keyof TObject): boolean =>
  Object.prototype.hasOwnProperty.call(value, property);

const isProjectConflictError = (
  error: unknown
): error is ToduProjectServiceError | ToduProjectIntegrationServiceError =>
  (error instanceof ToduProjectServiceError ||
    error instanceof ToduProjectIntegrationServiceError) &&
  error.causeCode === "conflict";

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  ProjectCheckToolDetails,
  ProjectIntegrationToolDependencies,
  ProjectRegisterToolDetails,
};
export {
  createProjectCheckToolDefinition,
  createProjectRegisterToolDefinition,
  formatProjectCheckContent,
  formatProjectRegisterContent,
  normalizeProjectCheckInput,
  normalizeProjectRegisterInput,
  registerProjectIntegrationTools,
};
