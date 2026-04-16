import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import {
  createProjectIntegrationService,
  type IntegrationBinding,
} from "@/services/project-integration-service";
import type { ProjectService } from "@/services/project-service";
import type { RepoContextService } from "@/services/repo-context";
import {
  createToduProjectIntegrationService,
  ToduProjectIntegrationServiceError,
} from "@/services/todu/todu-project-integration-service";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  authorizedAssigneeActorIds: [],
  ...overrides,
});

const createBinding = (overrides: Partial<IntegrationBinding> = {}): IntegrationBinding => ({
  id: "ibind-1",
  provider: "github",
  projectId: "proj-1",
  targetKind: "repository",
  targetRef: "evcraddock/todu-pi-extensions",
  strategy: "bidirectional",
  enabled: true,
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
  ...overrides,
});

describe("createProjectIntegrationService", () => {
  it("returns registered when one matching binding exists", async () => {
    const project = createProjectSummary();
    const service = createProjectIntegrationService({
      projectService: {
        getProject: vi.fn().mockResolvedValue(project),
      } as unknown as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
      gateway: {
        listIntegrationBindings: vi.fn().mockResolvedValue([createBinding()]),
        createIntegrationBinding: vi.fn(),
      },
    });

    await expect(service.checkRepositoryBinding()).resolves.toEqual({
      kind: "registered",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      binding: createBinding(),
      project,
    });
  });

  it("returns explicit ambiguity when multiple bindings match", async () => {
    const service = createProjectIntegrationService({
      projectService: {} as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
      gateway: {
        listIntegrationBindings: vi
          .fn()
          .mockResolvedValue([createBinding(), createBinding({ id: "ibind-2" })]),
        createIntegrationBinding: vi.fn(),
      },
    });

    await expect(service.checkRepositoryBinding()).resolves.toEqual({
      kind: "ambiguous",
      reason: "multiple-matching-bindings",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      bindings: [createBinding(), createBinding({ id: "ibind-2" })],
    });
  });

  it("returns not-registered when no binding matches", async () => {
    const service = createProjectIntegrationService({
      projectService: {} as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
      gateway: {
        listIntegrationBindings: vi.fn().mockResolvedValue([]),
        createIntegrationBinding: vi.fn(),
      },
    });

    await expect(service.checkRepositoryBinding()).resolves.toEqual({
      kind: "not-registered",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
    });
  });

  it("registers a repository project through project creation plus binding creation", async () => {
    const project = createProjectSummary({ name: "todu-pi-extensions" });
    const createIntegrationBinding = vi.fn().mockResolvedValue(createBinding());
    const service = createProjectIntegrationService({
      projectService: {
        createProject: vi.fn().mockResolvedValue(project),
      } as unknown as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
      gateway: {
        listIntegrationBindings: vi.fn().mockResolvedValue([]),
        createIntegrationBinding,
      },
    });

    await expect(service.registerRepositoryProject({})).resolves.toEqual({
      kind: "registered",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      project,
      binding: createBinding(),
      createdProject: true,
      createdBinding: true,
    });
    expect(createIntegrationBinding).toHaveBeenCalledWith({
      provider: "github",
      projectId: "proj-1",
      targetKind: "repository",
      targetRef: "evcraddock/todu-pi-extensions",
      strategy: undefined,
      enabled: undefined,
    });
  });

  it("treats explicit provider and targetRef as higher priority than repo detection", async () => {
    const project = createProjectSummary({ name: "custom" });
    const service = createProjectIntegrationService({
      projectService: {
        createProject: vi.fn().mockResolvedValue(project),
      } as unknown as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
      gateway: {
        listIntegrationBindings: vi.fn().mockResolvedValue([]),
        createIntegrationBinding: vi
          .fn()
          .mockResolvedValue(createBinding({ provider: "forgejo", targetRef: "team/custom" })),
      },
    });

    const result = await service.registerRepositoryProject({
      provider: "forgejo",
      targetRef: "team/custom",
      projectName: "custom",
    });

    expect(result).toEqual({
      kind: "registered",
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "forgejo",
        targetRef: "team/custom",
      },
      project,
      binding: createBinding({ provider: "forgejo", targetRef: "team/custom" }),
      createdProject: true,
      createdBinding: true,
    });
  });
});

describe("createToduProjectIntegrationService", () => {
  it("wraps daemon gateway failures in an integration-service error", async () => {
    const service = createToduProjectIntegrationService({
      client: {
        listIntegrationBindings: vi.fn().mockRejectedValue(
          new ToduDaemonClientError({
            code: "unavailable",
            method: "integration.list",
            message: "integration.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
            details: { socketPath: "/tmp/daemon.sock" },
          })
        ),
      } as never,
      projectService: {} as ProjectService,
      repoContextService: {
        resolveRepository: vi.fn().mockResolvedValue({
          kind: "resolved",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as RepoContextService,
    });

    await expect(service.checkRepositoryBinding()).rejects.toEqual(
      expect.objectContaining<ToduProjectIntegrationServiceError>({
        name: "ToduProjectIntegrationServiceError",
        operation: "checkRepositoryBinding",
        causeCode: "unavailable",
        message:
          "checkRepositoryBinding failed: integration.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );
  });
});
