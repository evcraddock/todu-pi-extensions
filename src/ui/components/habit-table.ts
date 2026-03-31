import type { HabitStreak, HabitSummaryWithStreak } from "../../domain/habit";

interface HabitTableRow {
  habit: string;
  project: string;
  streak: string;
  today: string;
}

const formatHabitTable = (habits: HabitSummaryWithStreak[]): string => {
  if (habits.length === 0) {
    return "No habits found.";
  }

  const rows: HabitTableRow[] = habits.map((habit) => ({
    habit: habit.title,
    project: habit.projectName ?? habit.projectId,
    streak: formatStreakCell(habit.streak),
    today: formatTodayCell(habit.streak),
  }));

  const headers: HabitTableRow = {
    habit: "Habit",
    project: "Project",
    streak: "Streak",
    today: "Today",
  };

  const colWidths = {
    habit: Math.max(headers.habit.length, ...rows.map((row) => row.habit.length)),
    project: Math.max(headers.project.length, ...rows.map((row) => row.project.length)),
    streak: Math.max(headers.streak.length, ...rows.map((row) => stripAnsi(row.streak).length)),
    today: Math.max(headers.today.length, ...rows.map((row) => stripAnsi(row.today).length)),
  };

  const lines: string[] = [];
  lines.push(topBorder(colWidths));
  lines.push(dataRow(headers, colWidths));
  lines.push(middleBorder(colWidths));

  for (let i = 0; i < rows.length; i++) {
    lines.push(dataRow(rows[i]!, colWidths));
    if (i < rows.length - 1) {
      lines.push(middleBorder(colWidths));
    }
  }

  lines.push(bottomBorder(colWidths));
  return lines.join("\n");
};

const formatStreakCell = (streak: HabitStreak | null): string => {
  if (!streak) {
    return "?";
  }

  return streak.current > 0 ? `🔥 ${streak.current}` : "0";
};

const formatTodayCell = (streak: HabitStreak | null): string => {
  if (!streak) {
    return "?";
  }

  return streak.completedToday ? "✅" : "—";
};

type ColWidths = Record<keyof HabitTableRow, number>;

const pad = (value: string, width: number): string => {
  const visibleLength = stripAnsi(value).length;
  const padding = Math.max(0, width - visibleLength);
  return value + " ".repeat(padding);
};

const topBorder = (w: ColWidths): string =>
  `┌─${"─".repeat(w.habit)}─┬─${"─".repeat(w.project)}─┬─${"─".repeat(w.streak)}─┬─${"─".repeat(w.today)}─┐`;

const middleBorder = (w: ColWidths): string =>
  `├─${"─".repeat(w.habit)}─┼─${"─".repeat(w.project)}─┼─${"─".repeat(w.streak)}─┼─${"─".repeat(w.today)}─┤`;

const bottomBorder = (w: ColWidths): string =>
  `└─${"─".repeat(w.habit)}─┴─${"─".repeat(w.project)}─┴─${"─".repeat(w.streak)}─┴─${"─".repeat(w.today)}─┘`;

const dataRow = (row: HabitTableRow, w: ColWidths): string =>
  `│ ${pad(row.habit, w.habit)} │ ${pad(row.project, w.project)} │ ${pad(row.streak, w.streak)} │ ${pad(row.today, w.today)} │`;

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

const stripAnsi = (value: string): string => value.replace(ANSI_REGEX, "");

export { formatHabitTable, formatStreakCell, formatTodayCell, stripAnsi };
