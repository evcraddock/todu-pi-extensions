import { describe, expect, it } from "vitest";

import type { HabitSummaryWithStreak } from "@/domain/habit";
import { formatHabitTable, formatStreakCell, formatTodayCell } from "@/ui/components/habit-table";

const createHabit = (overrides: Partial<HabitSummaryWithStreak> = {}): HabitSummaryWithStreak => ({
  id: "habit-1",
  title: "floss",
  projectId: "proj-1",
  projectName: "wellness",
  schedule: "FREQ=DAILY",
  timezone: "America/Chicago",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-31",
  paused: false,
  streak: { current: 10, longest: 10, completedToday: true, totalCheckins: 17 },
  ...overrides,
});

describe("formatStreakCell", () => {
  it("shows fire emoji for streaks > 0", () => {
    expect(
      formatStreakCell({ current: 10, longest: 10, completedToday: true, totalCheckins: 17 })
    ).toBe("🔥 10");
  });

  it("shows plain 0 for zero streaks", () => {
    expect(
      formatStreakCell({ current: 0, longest: 5, completedToday: false, totalCheckins: 3 })
    ).toBe("0");
  });

  it("shows ? when streak is null", () => {
    expect(formatStreakCell(null)).toBe("?");
  });
});

describe("formatTodayCell", () => {
  it("shows check for completed today", () => {
    expect(
      formatTodayCell({ current: 10, longest: 10, completedToday: true, totalCheckins: 17 })
    ).toBe("✅");
  });

  it("shows dash for not completed", () => {
    expect(
      formatTodayCell({ current: 0, longest: 5, completedToday: false, totalCheckins: 3 })
    ).toBe("—");
  });

  it("shows ? when streak is null", () => {
    expect(formatTodayCell(null)).toBe("?");
  });
});

describe("formatHabitTable", () => {
  it("returns empty message for no habits", () => {
    expect(formatHabitTable([])).toBe("No habits found.");
  });

  it("renders a table with headers and data rows", () => {
    const table = formatHabitTable([createHabit()]);

    expect(table).toContain("Habit");
    expect(table).toContain("Project");
    expect(table).toContain("Streak");
    expect(table).toContain("Today");
    expect(table).toContain("floss");
    expect(table).toContain("wellness");
    expect(table).toContain("🔥 10");
    expect(table).toContain("✅");
    expect(table).toContain("┌");
    expect(table).toContain("└");
  });

  it("renders multiple habits with separators", () => {
    const table = formatHabitTable([
      createHabit({
        id: "h-1",
        title: "floss",
        streak: { current: 10, longest: 10, completedToday: true, totalCheckins: 17 },
      }),
      createHabit({
        id: "h-2",
        title: "exercise",
        streak: { current: 0, longest: 5, completedToday: false, totalCheckins: 3 },
      }),
    ]);

    expect(table).toContain("floss");
    expect(table).toContain("exercise");
    expect(table).toContain("🔥 10");
    expect(table).toContain("0");
    expect(table).toContain("—");
  });

  it("handles null streak gracefully", () => {
    const table = formatHabitTable([createHabit({ streak: null })]);

    expect(table).toContain("?");
  });
});
