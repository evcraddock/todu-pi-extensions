import type { HabitStreak, HabitSummaryWithStreak } from "../../domain/habit";

const formatHabitTable = (habits: HabitSummaryWithStreak[]): string => {
  if (habits.length === 0) {
    return "No habits found.";
  }

  const habitWidth = Math.max(...habits.map((h) => h.title.length));
  const projectWidth = Math.max(...habits.map((h) => (h.projectName ?? h.projectId).length));
  const maxStreakNum = Math.max(...habits.map((h) => String(h.streak?.current ?? 0).length));

  const lines: string[] = [];

  for (const habit of habits) {
    const title = habit.title.padEnd(habitWidth);
    const project = (habit.projectName ?? habit.projectId).padEnd(projectWidth);
    const streak = formatStreakCell(habit.streak, maxStreakNum);
    const today = formatTodayCell(habit.streak);
    lines.push(`${title}   ${project}   ${streak}   ${today}`);
  }

  return lines.join("\n");
};

const formatStreakCell = (streak: HabitStreak | null, numWidth: number): string => {
  if (!streak) {
    return " ".repeat(3 + numWidth);
  }

  const num = String(streak.current).padStart(numWidth);
  if (streak.current > 0) {
    return `🔥 ${num}`;
  }

  return `   ${num}`;
};

const formatTodayCell = (streak: HabitStreak | null): string => {
  if (!streak) {
    return "?";
  }

  return streak.completedToday ? "✅" : "—";
};

export { formatHabitTable, formatStreakCell, formatTodayCell };
