import { describe, expect, it, vi } from "vitest";

import type { HabitSummary } from "@/domain/habit";
import { registerTools } from "@/extension/register-tools";
import type { HabitService } from "@/services/habit-service";
import type { TaskService } from "@/services/task-service";
import { createHabitListToolDefinition, formatHabitListContent } from "@/tools/habit-read-tools";

const createHabitSummary = (overrides: Partial<HabitSummary> = {}): HabitSummary => ({
  id: "habit-1",
  title: "Morning meditation",
  projectId: "proj-1",
  projectName: "Personal",
  schedule: "FREQ=DAILY",
  timezone: "America/Chicago",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-31",
  paused: false,
  ...overrides,
});

describe("registerTools", () => {
  it("registers the habit read tool", () => {
    const pi = { registerTool: vi.fn() };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getHabitService: vi.fn().mockResolvedValue({} as HabitService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(expect.arrayContaining(["habit_list"]));
  });
});

describe("formatHabitListContent", () => {
  it("formats concise habit summary lines", () => {
    expect(
      formatHabitListContent({
        kind: "habit_list",
        habits: [createHabitSummary()],
        total: 1,
        empty: false,
      })
    ).toContain("habit-1 • Morning meditation • active • Personal");
  });

  it("returns empty message when no habits exist", () => {
    expect(
      formatHabitListContent({
        kind: "habit_list",
        habits: [],
        total: 0,
        empty: true,
      })
    ).toBe("No habits found.");
  });
});

describe("createHabitListToolDefinition", () => {
  it("lists habits and returns structured details", async () => {
    const habits = [createHabitSummary()];
    const habitService = {
      listHabits: vi.fn().mockResolvedValue(habits),
    } as unknown as HabitService;
    const tool = createHabitListToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(habitService.listHabits).toHaveBeenCalledWith();
    expect(result.content[0]?.text).toContain("Habits (1):");
    expect(result.details).toEqual({
      kind: "habit_list",
      habits,
      total: 1,
      empty: false,
    });
  });

  it("returns empty details when no habits exist", async () => {
    const habitService = {
      listHabits: vi.fn().mockResolvedValue([]),
    } as unknown as HabitService;
    const tool = createHabitListToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toBe("No habits found.");
    expect(result.details).toMatchObject({ empty: true, total: 0 });
  });

  it("throws on service failure", async () => {
    const habitService = {
      listHabits: vi.fn().mockRejectedValue(new Error("connection lost")),
    } as unknown as HabitService;
    const tool = createHabitListToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow("habit_list failed");
  });
});
