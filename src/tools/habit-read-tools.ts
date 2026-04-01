import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { HabitDetail, HabitId, HabitStreak, HabitSummaryWithStreak } from "../domain/habit";
import type { HabitService } from "../services/habit-service";
const HabitListParams = Type.Object({});

const HabitShowParams = Type.Object({
  habitId: Type.String({ description: "Habit ID" }),
});
const MAX_HABIT_LIST_PREVIEW_COUNT = 25;

interface HabitListToolDetails {
  kind: "habit_list";
  habits: HabitSummaryWithStreak[];
  total: number;
  empty: boolean;
}

interface HabitShowToolParams {
  habitId: HabitId;
}

interface HabitShowToolDetails {
  kind: "habit_show";
  habitId: HabitId;
  found: boolean;
  habit?: HabitDetail;
  streak?: HabitStreak;
}

interface HabitReadToolDependencies {
  getHabitService: () => Promise<HabitService>;
}

const createHabitListToolDefinition = ({ getHabitService }: HabitReadToolDependencies) => ({
  name: "habit_list",
  label: "Habit List",
  description: "List habits.",
  promptSnippet: "List habits through the native habit service.",
  promptGuidelines: [
    "Use this tool for backend habit lookups in normal chat.",
    "Keep habit_list unfiltered in the first wave unless the task explicitly widens scope.",
  ],
  parameters: HabitListParams,
  async execute(_toolCallId: string, _params: Record<string, never>) {
    try {
      const habitService = await getHabitService();
      const habits = await habitService.listHabitsWithStreaks();
      const details: HabitListToolDetails = {
        kind: "habit_list",
        habits,
        total: habits.length,
        empty: habits.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "habit_list failed"), { cause: error });
    }
  },
});

const createHabitShowToolDefinition = ({ getHabitService }: HabitReadToolDependencies) => ({
  name: "habit_show",
  label: "Habit Show",
  description: "Show habit details, including description, schedule, and streak.",
  promptSnippet: "Show details for a specific habit by habit ID.",
  promptGuidelines: [
    "Use this tool when the user asks for details about a known habit ID.",
    "If the habit is missing, report the explicit not-found result instead of guessing.",
  ],
  parameters: HabitShowParams,
  async execute(_toolCallId: string, params: HabitShowToolParams) {
    try {
      const habitService = await getHabitService();
      const habit = await habitService.getHabit(params.habitId);
      if (!habit) {
        const details: HabitShowToolDetails = {
          kind: "habit_show",
          habitId: params.habitId,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Habit not found: ${params.habitId}` }],
          details,
        };
      }

      const streak = await safeGetStreak(habitService, params.habitId);
      const details: HabitShowToolDetails = {
        kind: "habit_show",
        habitId: params.habitId,
        found: true,
        habit,
        streak: streak ?? undefined,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitShowContent(habit, streak) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "habit_show failed"), { cause: error });
    }
  },
});

const registerHabitReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: HabitReadToolDependencies
): void => {
  pi.registerTool(createHabitListToolDefinition(dependencies));
  pi.registerTool(createHabitShowToolDefinition(dependencies));
};

const safeGetStreak = async (
  habitService: HabitService,
  habitId: HabitId
): Promise<HabitStreak | null> => {
  try {
    return await habitService.getHabitStreak(habitId);
  } catch {
    return null;
  }
};

const formatHabitListContent = (details: HabitListToolDetails): string => {
  if (details.empty) {
    return "No habits found.";
  }

  const previewHabits = details.habits.slice(0, MAX_HABIT_LIST_PREVIEW_COUNT);
  const lines = [`Habits (${details.total}):`];

  for (const habit of previewHabits) {
    lines.push(`- ${formatHabitSummaryLine(habit)}`);
  }

  const remainingCount = details.total - previewHabits.length;
  if (remainingCount > 0) {
    lines.push(`- ... ${remainingCount} more habit(s)`);
  }

  return lines.join("\n");
};

const formatHabitSummaryLine = (habit: HabitSummaryWithStreak): string => {
  const projectLabel = habit.projectName ?? habit.projectId;
  const status = habit.paused ? "paused" : "active";
  const streakLabel = formatStreakLabel(habit.streak);
  const todayLabel = formatTodayLabel(habit.streak);
  return `${habit.id} • ${habit.title} • ${status} • ${projectLabel} • streak: ${streakLabel} • today: ${todayLabel}`;
};

const formatStreakLabel = (streak: HabitStreak | null): string => {
  if (!streak) {
    return "?";
  }

  return streak.current > 0 ? `🔥 ${streak.current}` : "0";
};

const formatTodayLabel = (streak: HabitStreak | null): string => {
  if (!streak) {
    return "?";
  }

  return streak.completedToday ? "✅" : "—";
};

const formatHabitShowContent = (habit: HabitDetail, streak: HabitStreak | null): string => {
  const status = habit.paused ? "paused" : "active";
  const projectLabel = habit.projectName ?? habit.projectId;
  const streakLabel = streak
    ? `${streak.current} current, ${streak.longest} longest, ${streak.totalCheckins} total`
    : "unknown";
  const todayLabel = streak ? (streak.completedToday ? "✅" : "—") : "?";

  const lines = [
    `Habit ${habit.id}: ${habit.title}`,
    "",
    `Status: ${status}`,
    `Project: ${projectLabel}`,
    `Schedule: ${habit.schedule}`,
    `Timezone: ${habit.timezone}`,
    `Start: ${habit.startDate}`,
    `End: ${habit.endDate ?? "none"}`,
    `Next due: ${habit.nextDue}`,
    "",
    "Description:",
    habit.description?.trim().length ? habit.description : "(none)",
    "",
    `Streak: ${streakLabel}`,
    `Today: ${todayLabel}`,
  ];

  return lines.join("\n");
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { HabitListToolDetails, HabitReadToolDependencies, HabitShowToolDetails };
export {
  createHabitListToolDefinition,
  createHabitShowToolDefinition,
  formatHabitListContent,
  formatHabitShowContent,
  formatStreakLabel,
  formatTodayLabel,
  registerHabitReadTools,
};
