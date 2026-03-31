import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { HabitSummary } from "../domain/habit";
import type { HabitService } from "../services/habit-service";

const HabitListParams = Type.Object({});
const MAX_HABIT_LIST_PREVIEW_COUNT = 25;

interface HabitListToolDetails {
  kind: "habit_list";
  habits: HabitSummary[];
  total: number;
  empty: boolean;
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
      const habits = await habitService.listHabits();
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

const registerHabitReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: HabitReadToolDependencies
): void => {
  pi.registerTool(createHabitListToolDefinition(dependencies));
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

const formatHabitSummaryLine = (habit: HabitSummary): string => {
  const projectLabel = habit.projectName ?? habit.projectId;
  const status = habit.paused ? "paused" : "active";
  return `${habit.id} • ${habit.title} • ${status} • ${projectLabel}`;
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { HabitListToolDetails, HabitReadToolDependencies };
export { createHabitListToolDefinition, formatHabitListContent, registerHabitReadTools };
