import { describe, expect, it, vi } from "vitest";

import type { RecurringTemplateSummary } from "@/domain/recurring";
import { registerTools } from "@/extension/register-tools";
import type { RecurringService } from "@/services/recurring-service";
import type { TaskService } from "@/services/task-service";
import {
  createRecurringListToolDefinition,
  formatRecurringListContent,
} from "@/tools/recurring-read-tools";

const createRecurringSummary = (
  overrides: Partial<RecurringTemplateSummary> = {}
): RecurringTemplateSummary => ({
  id: "rec-1",
  title: "Weekly review",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  priority: "medium",
  schedule: "FREQ=WEEKLY;BYDAY=FR",
  timezone: "UTC",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-06",
  missPolicy: "accumulate",
  paused: false,
  ...overrides,
});

describe("registerTools", () => {
  it("registers the recurring read tool", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getRecurringService: vi.fn().mockResolvedValue({} as RecurringService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(expect.arrayContaining(["recurring_list"]));
  });
});

describe("formatRecurringListContent", () => {
  it("formats concise recurring summary lines", () => {
    expect(
      formatRecurringListContent({
        kind: "recurring_list",
        templates: [createRecurringSummary()],
        total: 1,
        empty: false,
      })
    ).toContain("rec-1 • Weekly review • active • medium • Todu Pi Extensions");
  });
});

describe("createRecurringListToolDefinition", () => {
  it("lists recurring templates and returns structured details", async () => {
    const templates = [createRecurringSummary()];
    const recurringService = {
      listRecurring: vi.fn().mockResolvedValue(templates),
    } as unknown as RecurringService;
    const tool = createRecurringListToolDefinition({
      getRecurringService: vi.fn().mockResolvedValue(recurringService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(recurringService.listRecurring).toHaveBeenCalledWith();
    expect(result.content[0]?.text).toContain("Recurring templates (1):");
    expect(result.details).toEqual({
      kind: "recurring_list",
      templates,
      total: 1,
      empty: false,
    });
  });

  it("returns a non-error empty result when no recurring templates exist", async () => {
    const recurringService = {
      listRecurring: vi.fn().mockResolvedValue([]),
    } as unknown as RecurringService;
    const tool = createRecurringListToolDefinition({
      getRecurringService: vi.fn().mockResolvedValue(recurringService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toBe("No recurring templates found.");
    expect(result.details).toEqual({
      kind: "recurring_list",
      templates: [],
      total: 0,
      empty: true,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createRecurringListToolDefinition({
      getRecurringService: vi.fn().mockResolvedValue({
        listRecurring: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as RecurringService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "recurring_list failed: daemon unavailable"
    );
  });
});
