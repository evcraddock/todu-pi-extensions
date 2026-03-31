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
  it("shows fire emoji with right-aligned number for streaks > 0", () => {
    expect(
      formatStreakCell({ current: 10, longest: 10, completedToday: true, totalCheckins: 17 }, 2)
    ).toBe("🔥 10");
  });

  it("pads number to width", () => {
    expect(
      formatStreakCell({ current: 2, longest: 10, completedToday: true, totalCheckins: 5 }, 2)
    ).toBe("🔥  2");
  });

  it("shows spaces instead of fire for zero streaks", () => {
    expect(
      formatStreakCell({ current: 0, longest: 5, completedToday: false, totalCheckins: 3 }, 2)
    ).toBe("    0");
  });

  it("returns spaces when streak is null", () => {
    expect(formatStreakCell(null, 2)).toBe("     ");
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
      formatTodayCell({ current: 3, longest: 5, completedToday: false, totalCheckins: 10 })
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

  it("renders aligned rows", () => {
    const table = formatHabitTable([
      createHabit({
        title: "floss",
        streak: { current: 10, longest: 10, completedToday: true, totalCheckins: 17 },
      }),
      createHabit({
        title: "exercise",
        streak: { current: 3, longest: 5, completedToday: false, totalCheckins: 10 },
      }),
    ]);

    const lines = table.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("floss");
    expect(lines[0]).toContain("🔥 10");
    expect(lines[0]).toContain("✅");
    expect(lines[1]).toContain("exercise");
    expect(lines[1]).toContain("🔥  3");
    expect(lines[1]).toContain("—");
  });

  it("aligns fire icons in the same column", () => {
    const table = formatHabitTable([
      createHabit({
        title: "floss",
        streak: { current: 10, longest: 10, completedToday: true, totalCheckins: 17 },
      }),
      createHabit({
        title: "rest",
        streak: { current: 0, longest: 0, completedToday: false, totalCheckins: 0 },
      }),
    ]);

    const lines = table.split("\n");
    // fire line has 🔥, zero line has spaces in same position
    expect(lines[0]).toContain("🔥 10");
    expect(lines[1]).toContain("    0");
  });

  it("handles null streak gracefully", () => {
    const table = formatHabitTable([createHabit({ streak: null })]);

    expect(table).toContain("floss");
    expect(table).toContain("?");
  });
});
