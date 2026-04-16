import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type {
  IntegrationBinding,
  ProjectIntegrationService,
} from "@/services/project-integration-service";
import type { ProjectService } from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import {
  createProjectCheckToolDefinition,
  createProjectRegisterToolDefinition,
  formatProjectCheckContent,
  formatProjectRegisterContent,
} from "@/tools/project-integration-tools";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "todu-pi-extensions",
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

describe("registerTools", () => {
  it("registers the native project integration tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
      getProjectIntegrationService: vi.fn().mockResolvedValue({} as ProjectIntegrationService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["project_check", "project_register"])
    );
  });
});

describe("formatProjectCheckContent", () => {
  it("formats registered results concisely", () => {
    expect(
      formatProjectCheckContent({
        kind: "project_check",
        state: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project: createProjectSummary(),
        binding: createBinding(),
      })
    ).toContain("Registration: Registered");
  });
});

describe("formatProjectRegisterContent", () => {
  it("formats registration results concisely", () => {
    expect(
      formatProjectRegisterContent({
        kind: "project_register",
        state: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project: createProjectSummary(),
        binding: createBinding(),
        createdProject: true,
        createdBinding: true,
      })
    ).toContain("Registered project proj-1: todu-pi-extensions");
  });
});

describe("createProjectCheckToolDefinition", () => {
  it("returns a structured registered result", async () => {
    const projectIntegrationService = {
      checkRepositoryBinding: vi.fn().mockResolvedValue({
        kind: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project: createProjectSummary(),
        binding: createBinding(),
      }),
    } as unknown as ProjectIntegrationService;
    const tool = createProjectCheckToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(projectIntegrationService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(projectIntegrationService.checkRepositoryBinding).toHaveBeenCalledWith({
      repositoryPath: undefined,
      provider: undefined,
      targetRef: undefined,
    });
    expect(result.details).toEqual({
      kind: "project_check",
      state: "registered",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      project: createProjectSummary(),
      binding: createBinding(),
    });
  });

  it("returns explicit not-registered results", async () => {
    const tool = createProjectCheckToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockResolvedValue({
          kind: "not-registered",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as ProjectIntegrationService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain("Registration: Not Registered");
    expect(result.details).toEqual({
      kind: "project_check",
      state: "not-registered",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
    });
  });

  it("returns explicit ambiguity results", async () => {
    const tool = createProjectCheckToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockResolvedValue({
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
        }),
      } as unknown as ProjectIntegrationService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain("Registration: Ambiguous");
    expect(result.details).toEqual({
      kind: "project_check",
      state: "ambiguous",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      bindings: [createBinding(), createBinding({ id: "ibind-2" })],
      remotes: undefined,
      reason: "multiple-matching-bindings",
    });
  });

  it("surfaces backend failures with tool-specific context", async () => {
    const tool = createProjectCheckToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as ProjectIntegrationService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "project_check failed: daemon unavailable"
    );
  });
});

describe("createProjectRegisterToolDefinition", () => {
  it("registers a repository-backed project successfully", async () => {
    const project = createProjectSummary();
    const binding = createBinding();
    const projectIntegrationService = {
      checkRepositoryBinding: vi.fn().mockResolvedValue({
        kind: "not-registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
      }),
      registerRepositoryProject: vi.fn().mockResolvedValue({
        kind: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project,
        binding,
        createdProject: true,
        createdBinding: true,
      }),
    } as unknown as ProjectIntegrationService;
    const projectService = {
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as ProjectService;
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(projectIntegrationService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(projectIntegrationService.checkRepositoryBinding).toHaveBeenCalledWith({
      projectName: undefined,
      repositoryPath: undefined,
      provider: undefined,
      targetRef: undefined,
      description: undefined,
      priority: undefined,
    });
    expect(projectService.listProjects).toHaveBeenCalledWith();
    expect(projectIntegrationService.registerRepositoryProject).toHaveBeenCalledWith({
      projectName: undefined,
      repositoryPath: undefined,
      provider: undefined,
      targetRef: undefined,
      description: undefined,
      priority: undefined,
    });
    expect(result.details).toEqual({
      kind: "project_register",
      state: "registered",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      project,
      binding,
      createdProject: true,
      createdBinding: true,
    });
  });

  it("returns explicit already-registered results", async () => {
    const projectIntegrationService = {
      checkRepositoryBinding: vi.fn().mockResolvedValue({
        kind: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project: createProjectSummary(),
        binding: createBinding(),
      }),
      registerRepositoryProject: vi.fn().mockResolvedValue({
        kind: "already-registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "github",
          targetRef: "evcraddock/todu-pi-extensions",
        },
        project: createProjectSummary(),
        binding: createBinding(),
      }),
    } as unknown as ProjectIntegrationService;
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(projectIntegrationService),
      getProjectService: vi
        .fn()
        .mockResolvedValue({ listProjects: vi.fn() } as unknown as ProjectService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain("Repository is already registered.");
    expect(result.details).toEqual({
      kind: "project_register",
      state: "already-registered",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      project: createProjectSummary(),
      binding: createBinding(),
    });
  });

  it("returns explicit name-conflict results", async () => {
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockResolvedValue({
          kind: "not-registered",
          repository: {
            repositoryPath: "/tmp/repo",
            remoteName: "origin",
            remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
            provider: "github",
            targetRef: "evcraddock/todu-pi-extensions",
          },
        }),
      } as unknown as ProjectIntegrationService),
      getProjectService: vi.fn().mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([createProjectSummary()]),
      } as unknown as ProjectService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toContain(
      "Repository registration blocked by project name conflict."
    );
    expect(result.details).toEqual({
      kind: "project_register",
      state: "name-conflict",
      repositoryPath: undefined,
      repository: {
        repositoryPath: "/tmp/repo",
        remoteName: "origin",
        remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
        provider: "github",
        targetRef: "evcraddock/todu-pi-extensions",
      },
      conflictingProjects: [createProjectSummary()],
      reason: "project-name-conflict",
    });
  });

  it("returns explicit missing-context results", async () => {
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockResolvedValue({
          kind: "missing-context",
          reason: "not-a-git-repository",
          repositoryPath: "/tmp/nope",
        }),
        registerRepositoryProject: vi.fn().mockResolvedValue({
          kind: "missing-context",
          reason: "not-a-git-repository",
          repositoryPath: "/tmp/nope",
        }),
      } as unknown as ProjectIntegrationService),
      getProjectService: vi
        .fn()
        .mockResolvedValue({ listProjects: vi.fn() } as unknown as ProjectService),
    });

    const result = await tool.execute("tool-call-1", { repositoryPath: "/tmp/nope" });

    expect(result.content[0]?.text).toContain(
      "Repository registration requires repository context."
    );
    expect(result.details).toEqual({
      kind: "project_register",
      state: "missing-context",
      repositoryPath: "/tmp/nope",
      reason: "not-a-git-repository",
    });
  });

  it("respects explicit provider and targetRef precedence", async () => {
    const projectIntegrationService = {
      checkRepositoryBinding: vi.fn().mockResolvedValue({
        kind: "not-registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "forgejo",
          targetRef: "team/custom",
        },
      }),
      registerRepositoryProject: vi.fn().mockResolvedValue({
        kind: "registered",
        repository: {
          repositoryPath: "/tmp/repo",
          remoteName: "origin",
          remoteUrl: "git@github.com:evcraddock/todu-pi-extensions.git",
          provider: "forgejo",
          targetRef: "team/custom",
        },
        project: createProjectSummary({ name: "custom" }),
        binding: createBinding({ provider: "forgejo", targetRef: "team/custom" }),
        createdProject: true,
        createdBinding: true,
      }),
    } as unknown as ProjectIntegrationService;
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(projectIntegrationService),
      getProjectService: vi.fn().mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([]),
      } as unknown as ProjectService),
    });

    await tool.execute("tool-call-1", {
      provider: " forgejo ",
      targetRef: " team/custom ",
      repositoryPath: " /tmp/repo ",
      projectName: " custom ",
    });

    expect(projectIntegrationService.checkRepositoryBinding).toHaveBeenCalledWith({
      projectName: "custom",
      repositoryPath: "/tmp/repo",
      provider: "forgejo",
      targetRef: "team/custom",
      description: undefined,
      priority: undefined,
    });
    expect(projectIntegrationService.registerRepositoryProject).toHaveBeenCalledWith({
      projectName: "custom",
      repositoryPath: "/tmp/repo",
      provider: "forgejo",
      targetRef: "team/custom",
      description: undefined,
      priority: undefined,
    });
  });

  it("surfaces backend failures with tool-specific context", async () => {
    const tool = createProjectRegisterToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue({
        checkRepositoryBinding: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as ProjectIntegrationService),
      getProjectService: vi
        .fn()
        .mockResolvedValue({ listProjects: vi.fn() } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "project_register failed: daemon unavailable"
    );
  });
});
