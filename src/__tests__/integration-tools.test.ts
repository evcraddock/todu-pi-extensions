import { describe, expect, it, vi } from "vitest";

import type { ActorSummary } from "@/domain/actor";
import type { TaskSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { ActorService } from "@/services/actor-service";
import type {
  IntegrationBinding,
  IntegrationBindingStatus,
  ProjectIntegrationService,
} from "@/services/project-integration-service";
import type { ProjectService } from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import {
  createIntegrationShowToolDefinition,
  createIntegrationUpdateToolDefinition,
} from "@/tools/integration-tools";

const createBinding = (overrides: Partial<IntegrationBinding> = {}): IntegrationBinding => ({
  id: "ibind-1",
  provider: "github",
  projectId: "proj-1",
  targetKind: "repository",
  targetRef: "owner/repo",
  strategy: "bidirectional",
  enabled: true,
  options: {
    actorMappings: [
      {
        actorId: "actor-user",
        externalLogin: "erik",
        trusted: true,
      },
    ],
  },
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
  ...overrides,
});

const createStatus = (
  overrides: Partial<IntegrationBindingStatus> = {}
): IntegrationBindingStatus => ({
  bindingId: "ibind-1",
  state: "idle",
  authorityId: null,
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastErrorSummary: null,
  updatedAt: "2026-03-19T00:00:00.000Z",
  ...overrides,
});

const createTaskSummary = (overrides: Partial<TaskSummary> = {}): TaskSummary => ({
  id: "task-123",
  title: "Review mapping",
  status: "active",
  priority: "medium",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: [],
  assigneeActorIds: ["actor-user", "actor-reviewer"],
  assigneeDisplayNames: ["Erik", "Reviewer"],
  assignees: ["Erik", "Reviewer"],
  ...overrides,
});

const actors: ActorSummary[] = [
  { id: "actor-user", displayName: "Erik", archived: false },
  { id: "actor-reviewer", displayName: "Reviewer", archived: false },
];

describe("registerTools", () => {
  it("registers integration tools", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getProjectIntegrationService: vi.fn().mockResolvedValue({} as ProjectIntegrationService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["integration_list", "integration_show", "integration_update"])
    );
  });
});

describe("integration tools", () => {
  it("shows mappings, trust state, and unmapped assignee warnings", async () => {
    const integrationService = {
      getIntegrationBinding: vi.fn().mockResolvedValue(createBinding()),
      getIntegrationBindingStatus: vi.fn().mockResolvedValue(createStatus()),
    } as unknown as ProjectIntegrationService;
    const projectService = {
      listProjects: vi
        .fn()
        .mockResolvedValue([
          {
            id: "proj-1",
            name: "Todu Pi Extensions",
            status: "active",
            priority: "medium",
            description: null,
            authorizedAssigneeActorIds: [],
          },
        ]),
    } as unknown as ProjectService;
    const taskService = {
      listTasks: vi.fn().mockResolvedValue([createTaskSummary()]),
    } as unknown as TaskService;
    const actorService = {
      listActors: vi.fn().mockResolvedValue(actors),
    } as unknown as ActorService;
    const tool = createIntegrationShowToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(integrationService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
      getTaskService: vi.fn().mockResolvedValue(taskService),
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    const result = await tool.execute("tool-call-1", { bindingId: "ibind-1" });

    expect(result.content[0]?.text).toContain("Actor mappings (1):");
    expect(result.content[0]?.text).toContain("trust: trusted");
    expect(result.content[0]?.text).toContain("Skipped unmapped outbound assignee warnings:");
    expect(result.content[0]?.text).toContain("task-123 • Review mapping • Reviewer");
  });

  it("updates trust state for mapped actors", async () => {
    const integrationService = {
      getIntegrationBinding: vi.fn().mockResolvedValue(createBinding()),
      updateIntegrationBinding: vi.fn().mockResolvedValue(
        createBinding({
          options: {
            actorMappings: [{ actorId: "actor-user", externalLogin: "erik", trusted: false }],
          },
        })
      ),
    } as unknown as ProjectIntegrationService;
    const actorService = {
      listActors: vi.fn().mockResolvedValue(actors),
    } as unknown as ActorService;
    const tool = createIntegrationUpdateToolDefinition({
      getProjectIntegrationService: vi.fn().mockResolvedValue(integrationService),
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    const result = await tool.execute("tool-call-1", {
      bindingId: "ibind-1",
      untrustActorIds: ["actor-user"],
    });

    expect(integrationService.updateIntegrationBinding).toHaveBeenCalledWith(
      expect.objectContaining({ bindingId: "ibind-1" })
    );
    expect(result.content[0]?.text).toContain("Updated integration ibind-1");
  });
});
