import { describe, expect, it, vi } from "vitest";

import type { HabitDetail, HabitSummaryWithStreak } from "@/domain/habit";
import { registerTools } from "@/extension/register-tools";
import type { HabitService } from "@/services/habit-service";
import type { TaskService } from "@/services/task-service";
import {
  createHabitListToolDefinition,
  createHabitShowToolDefinition,
  formatHabitListContent,
  formatStreakLabel,
  formatTodayLabel,
} from "@/tools/habit-read-tools";

const createHabitDetail = (overrides: Partial<HabitDetail> = {}): HabitDetail => ({
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
  description: "10 minutes of mindfulness each morning.",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const createHabitWithStreak = (
  overrides: Partial<HabitSummaryWithStreak> = {}
): HabitSummaryWithStreak => ({
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
  streak: { current: 5, longest: 10, completedToday: true, totalCheckins: 25 },
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

describe("formatStreakLabel", () => {
  it("shows fire emoji for streaks > 0", () => {
    expect(
      formatStreakLabel({ current: 5, longest: 10, completedToday: true, totalCheckins: 25 })
    ).toBe("🔥 5");
  });

  it("shows plain 0 for zero streaks", () => {
    expect(
      formatStreakLabel({ current: 0, longest: 5, completedToday: false, totalCheckins: 10 })
    ).toBe("0");
  });

  it("shows ? when streak is null", () => {
    expect(formatStreakLabel(null)).toBe("?");
  });
});

describe("formatTodayLabel", () => {
  it("shows check for completed today", () => {
    expect(
      formatTodayLabel({ current: 5, longest: 10, completedToday: true, totalCheckins: 25 })
    ).toBe("✅");
  });

  it("shows dash for not completed", () => {
    expect(
      formatTodayLabel({ current: 0, longest: 5, completedToday: false, totalCheckins: 10 })
    ).toBe("—");
  });

  it("shows ? when streak is null", () => {
    expect(formatTodayLabel(null)).toBe("?");
  });
});

describe("formatHabitListContent", () => {
  it("formats habit summary lines with streak info", () => {
    const content = formatHabitListContent({
      kind: "habit_list",
      habits: [createHabitWithStreak()],
      total: 1,
      empty: false,
    });

    expect(content).toContain("Morning meditation");
    expect(content).toContain("streak: 🔥 5");
    expect(content).toContain("today: ✅");
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
  it("lists habits with streaks and returns structured details", async () => {
    const habits = [createHabitWithStreak()];
    const habitService = {
      listHabitsWithStreaks: vi.fn().mockResolvedValue(habits),
    } as unknown as HabitService;
    const tool = createHabitListToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(habitService.listHabitsWithStreaks).toHaveBeenCalledWith();
    expect(result.content[0]?.text).toContain("Habits (1):");
    expect(result.details).toMatchObject({
      kind: "habit_list",
      total: 1,
      empty: false,
    });
    expect(result.details.habits[0]?.streak).toEqual({
      current: 5,
      longest: 10,
      completedToday: true,
      totalCheckins: 25,
    });
  });

  it("returns empty details when no habits exist", async () => {
    const habitService = {
      listHabitsWithStreaks: vi.fn().mockResolvedValue([]),
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
      listHabitsWithStreaks: vi.fn().mockRejectedValue(new Error("connection lost")),
    } as unknown as HabitService;
    const tool = createHabitListToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow("habit_list failed");
  });
});

describe("createHabitShowToolDefinition", () => {
  it("returns habit detail with streak", async () => {
    const habit = createHabitDetail();
    const streak = { current: 5, longest: 10, completedToday: true, totalCheckins: 25 };
    const habitService = {
      getHabit: vi.fn().mockResolvedValue(habit),
      getHabitStreak: vi.fn().mockResolvedValue(streak),
    } as unknown as HabitService;
    const tool = createHabitShowToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", { habitId: "habit-1" });

    expect(habitService.getHabit).toHaveBeenCalledWith("habit-1");
    expect(result.content[0]?.text).toContain("Habit habit-1: Morning meditation");
    expect(result.content[0]?.text).toContain("Schedule: FREQ=DAILY");
    expect(result.content[0]?.text).toContain("10 minutes of mindfulness");
    expect(result.content[0]?.text).toContain("5 current, 10 longest");
    expect(result.details).toMatchObject({
      kind: "habit_show",
      habitId: "habit-1",
      found: true,
      habit,
      streak,
    });
  });

  it("returns not-found when habit is missing", async () => {
    const habitService = {
      getHabit: vi.fn().mockResolvedValue(null),
    } as unknown as HabitService;
    const tool = createHabitShowToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", { habitId: "habit-missing" });

    expect(result.content[0]?.text).toBe("Habit not found: habit-missing");
    expect(result.details).toMatchObject({
      kind: "habit_show",
      habitId: "habit-missing",
      found: false,
    });
  });

  it("still returns habit detail when streak fetch fails", async () => {
    const habit = createHabitDetail();
    const habitService = {
      getHabit: vi.fn().mockResolvedValue(habit),
      getHabitStreak: vi.fn().mockRejectedValue(new Error("streak unavailable")),
    } as unknown as HabitService;
    const tool = createHabitShowToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
    });

    const result = await tool.execute("tool-call-1", { habitId: "habit-1" });

    expect(result.content[0]?.text).toContain("Habit habit-1");
    expect(result.content[0]?.text).toContain("Streak: unknown");
    expect(result.details).toMatchObject({ found: true, streak: undefined });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createHabitShowToolDefinition({
      getHabitService: vi.fn().mockResolvedValue({
        getHabit: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as HabitService),
    });

    await expect(tool.execute("tool-call-1", { habitId: "habit-1" })).rejects.toThrow(
      "habit_show failed: daemon unavailable"
    );
  });
});
