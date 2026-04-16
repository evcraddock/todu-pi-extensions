import { describe, expect, it, vi } from "vitest";

import type { RecurringTemplateDetail } from "@/domain/recurring";
import type { ProjectSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { ProjectService } from "@/services/project-service";
import type { RecurringService } from "@/services/recurring-service";
import type { TaskService } from "@/services/task-service";
import { ToduRecurringServiceError } from "@/services/todu/todu-recurring-service";
import {
  createRecurringCreateToolDefinition,
  createRecurringDeleteToolDefinition,
  createRecurringUpdateToolDefinition,
  normalizeCreateRecurringInput,
  normalizeUpdateRecurringInput,
  resolveCreateRecurringInput,
  resolveUpdateRecurringInput,
} from "@/tools/recurring-mutation-tools";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  authorizedAssigneeActorIds: [],
  ...overrides,
});

const createRecurringDetail = (
  overrides: Partial<RecurringTemplateDetail> = {}
): RecurringTemplateDetail => ({
  id: "rec-1",
  title: "Weekly review",
  description: "End of week review",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: [],
  priority: "medium",
  schedule: "FREQ=WEEKLY;BYDAY=FR",
  timezone: "UTC",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-06",
  missPolicy: "accumulate",
  skippedDates: [],
  paused: false,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

describe("registerTools", () => {
  it("registers the recurring mutation tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
      getRecurringService: vi.fn().mockResolvedValue({} as RecurringService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["recurring_create", "recurring_update", "recurring_delete"])
    );
  });
});

describe("normalizeCreateRecurringInput", () => {
  it("trims required fields and normalizes schedules and blank text fields", () => {
    expect(
      normalizeCreateRecurringInput({
        title: "  Weekly review  ",
        projectId: " proj-1 ",
        schedule: " byday=fr; freq=weekly ",
        timezone: " UTC ",
        startDate: " 2026-03-01 ",
        description: "   ",
        endDate: "   ",
        priority: "high",
      })
    ).toEqual({
      title: "Weekly review",
      projectId: "proj-1",
      schedule: "FREQ=WEEKLY;BYDAY=FR",
      timezone: "UTC",
      startDate: "2026-03-01",
      description: null,
      endDate: null,
      priority: "high",
      missPolicy: undefined,
    });
  });

  it("fails fast for invalid schedules", () => {
    expect(() =>
      normalizeCreateRecurringInput({
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=HOURLY",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).toThrow("Sub-daily");
  });
});

describe("normalizeUpdateRecurringInput", () => {
  it("requires at least one supported mutation field", () => {
    expect(() => normalizeUpdateRecurringInput({ recurringId: "rec-1" })).toThrow(
      "recurring_update requires at least one supported field: title, projectId, schedule, timezone, startDate, description, priority, endDate, missPolicy, or paused"
    );
  });

  it("normalizes schedule updates and clears blank text fields", () => {
    expect(
      normalizeUpdateRecurringInput({
        recurringId: " rec-1 ",
        schedule: " interval=2;freq=daily ",
        description: "   ",
        endDate: "   ",
        paused: true,
      })
    ).toEqual({
      recurringId: "rec-1",
      priority: undefined,
      missPolicy: undefined,
      paused: true,
      schedule: "FREQ=DAILY;INTERVAL=2",
      description: null,
      endDate: null,
    });
  });
});

describe("resolveCreateRecurringInput", () => {
  it("resolves project names to project IDs", async () => {
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([createProjectSummary()]),
    } as unknown as ProjectService;

    await expect(
      resolveCreateRecurringInput(projectService, {
        title: "Weekly review",
        projectId: "Todu Pi Extensions",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).resolves.toEqual({
      title: "Weekly review",
      projectId: "proj-1",
      schedule: "FREQ=WEEKLY;BYDAY=FR",
      timezone: "UTC",
      startDate: "2026-03-01",
      description: undefined,
      priority: undefined,
      endDate: undefined,
      missPolicy: undefined,
    });
  });
});

describe("resolveUpdateRecurringInput", () => {
  it("resolves replacement project names to project IDs", async () => {
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([createProjectSummary()]),
    } as unknown as ProjectService;

    await expect(
      resolveUpdateRecurringInput(projectService, {
        recurringId: "rec-1",
        projectId: "Todu Pi Extensions",
        paused: true,
      })
    ).resolves.toEqual({
      recurringId: "rec-1",
      projectId: "proj-1",
      priority: undefined,
      missPolicy: undefined,
      paused: true,
    });
  });
});

describe("createRecurringCreateToolDefinition", () => {
  it("creates a recurring template and returns structured details", async () => {
    const template = createRecurringDetail();
    const projectService = {
      getProject: vi.fn().mockResolvedValue(createProjectSummary()),
    } as unknown as ProjectService;
    const recurringService = {
      createRecurring: vi.fn().mockResolvedValue(template),
    } as unknown as RecurringService;
    const tool = createRecurringCreateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
      getRecurringService: vi.fn().mockResolvedValue(recurringService),
    });

    const result = await tool.execute("tool-call-1", {
      title: "  Weekly review  ",
      projectId: " proj-1 ",
      schedule: " byday=fr; freq=weekly ",
      timezone: " UTC ",
      startDate: " 2026-03-01 ",
    });

    expect(recurringService.createRecurring).toHaveBeenCalledWith({
      title: "Weekly review",
      projectId: "proj-1",
      schedule: "FREQ=WEEKLY;BYDAY=FR",
      timezone: "UTC",
      startDate: "2026-03-01",
      description: undefined,
      priority: undefined,
      endDate: undefined,
      missPolicy: undefined,
    });
    expect(result.content[0]?.text).toContain(
      `Created recurring template ${template.id}: ${template.title}`
    );
    expect(result.details).toEqual({
      kind: "recurring_create",
      input: {
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
        description: undefined,
        priority: undefined,
        endDate: undefined,
        missPolicy: undefined,
      },
      template,
    });
  });
});

describe("createRecurringUpdateToolDefinition", () => {
  it("updates recurring fields and returns structured details", async () => {
    const template = createRecurringDetail({
      title: "Updated review",
      priority: "high",
      paused: true,
      schedule: "FREQ=DAILY",
    });
    const projectService = {
      getProject: vi.fn().mockResolvedValue(createProjectSummary()),
    } as unknown as ProjectService;
    const recurringService = {
      updateRecurring: vi.fn().mockResolvedValue(template),
    } as unknown as RecurringService;
    const tool = createRecurringUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
      getRecurringService: vi.fn().mockResolvedValue(recurringService),
    });

    const result = await tool.execute("tool-call-1", {
      recurringId: " rec-1 ",
      schedule: " freq=daily ",
      priority: "high",
      paused: true,
    });

    expect(recurringService.updateRecurring).toHaveBeenCalledWith({
      recurringId: "rec-1",
      priority: "high",
      missPolicy: undefined,
      paused: true,
      schedule: "FREQ=DAILY",
    });
    expect(result.content[0]?.text).toContain(
      `Updated recurring template ${template.id}: ${template.title}`
    );
    expect(result.details).toEqual({
      kind: "recurring_update",
      input: {
        recurringId: "rec-1",
        priority: "high",
        missPolicy: undefined,
        paused: true,
        schedule: "FREQ=DAILY",
      },
      template,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createRecurringUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
      getRecurringService: vi.fn().mockResolvedValue({} as RecurringService),
    });

    await expect(tool.execute("tool-call-1", { recurringId: "rec-1" })).rejects.toThrow(
      "recurring_update failed: recurring_update requires at least one supported field"
    );
  });
});

describe("createRecurringDeleteToolDefinition", () => {
  it("deletes a recurring template and returns structured details", async () => {
    const recurringService = {
      deleteRecurring: vi.fn().mockResolvedValue({ recurringId: "rec-1", deleted: true }),
    } as unknown as RecurringService;
    const tool = createRecurringDeleteToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
      getRecurringService: vi.fn().mockResolvedValue(recurringService),
    });

    const result = await tool.execute("tool-call-1", { recurringId: " rec-1 " });

    expect(recurringService.deleteRecurring).toHaveBeenCalledWith("rec-1");
    expect(result.content[0]?.text).toBe("Deleted recurring template rec-1.");
    expect(result.details).toEqual({
      kind: "recurring_delete",
      recurringId: "rec-1",
      found: true,
      deleted: true,
      template: { recurringId: "rec-1", deleted: true },
    });
  });

  it("returns an explicit not-found result when the template is missing", async () => {
    const tool = createRecurringDeleteToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
      getRecurringService: vi.fn().mockResolvedValue({
        deleteRecurring: vi.fn().mockRejectedValue(
          new ToduRecurringServiceError({
            operation: "deleteRecurring",
            causeCode: "not-found",
            message:
              "deleteRecurring failed: recurring.delete failed (NOT_FOUND): recurring template not found",
          })
        ),
      } as unknown as RecurringService),
    });

    const result = await tool.execute("tool-call-1", { recurringId: "rec-missing" });

    expect(result.content[0]?.text).toBe("Recurring template not found: rec-missing");
    expect(result.details).toEqual({
      kind: "recurring_delete",
      recurringId: "rec-missing",
      found: false,
      deleted: false,
    });
  });
});
