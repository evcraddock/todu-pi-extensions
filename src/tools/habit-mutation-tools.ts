import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { HabitCheckResult, HabitDetail } from "../domain/habit";
import type { ProjectSummary } from "../domain/task";
import type {
  CreateHabitInput,
  DeleteHabitResult,
  HabitService,
  UpdateHabitInput,
} from "../services/habit-service";
import type { ProjectService } from "../services/project-service";
import { ToduHabitServiceError } from "../services/todu/todu-habit-service";
import { validateAndNormalizeScheduleRule } from "../utils/schedule";

const HabitCreateParams = Type.Object({
  title: Type.String({ description: "Habit title" }),
  projectId: Type.String({ description: "Project ID or unique project name" }),
  schedule: Type.String({ description: "Normalized RRULE schedule string" }),
  timezone: Type.String({ description: "IANA timezone" }),
  startDate: Type.String({ description: "Start date in YYYY-MM-DD format" }),
  description: Type.Optional(Type.String({ description: "Optional habit description" })),
  endDate: Type.Optional(
    Type.String({
      description: "Optional end date in YYYY-MM-DD format. Use an empty string to clear it.",
    })
  ),
});

const HabitUpdateParams = Type.Object({
  habitId: Type.String({ description: "Habit ID" }),
  title: Type.Optional(Type.String({ description: "Optional replacement habit title" })),
  schedule: Type.Optional(
    Type.String({ description: "Optional replacement normalized RRULE schedule string" })
  ),
  timezone: Type.Optional(Type.String({ description: "Optional replacement IANA timezone" })),
  description: Type.Optional(
    Type.String({
      description: "Optional replacement description. Use an empty string to clear it.",
    })
  ),
  endDate: Type.Optional(
    Type.String({ description: "Optional replacement end date. Use an empty string to clear it." })
  ),
});

const HabitCheckParams = Type.Object({
  habitId: Type.String({ description: "Habit ID" }),
});

const HabitDeleteParams = Type.Object({
  habitId: Type.String({ description: "Habit ID" }),
});

interface HabitCreateToolParams {
  title: string;
  projectId: string;
  schedule: string;
  timezone: string;
  startDate: string;
  description?: string;
  endDate?: string;
}

interface HabitUpdateToolParams {
  habitId: string;
  title?: string;
  schedule?: string;
  timezone?: string;
  description?: string;
  endDate?: string;
}

interface HabitCheckToolParams {
  habitId: string;
}

interface HabitDeleteToolParams {
  habitId: string;
}

interface HabitCreateToolDetails {
  kind: "habit_create";
  input: CreateHabitInput;
  habit: HabitDetail;
}

interface HabitUpdateToolDetails {
  kind: "habit_update";
  input: UpdateHabitInput;
  habit: HabitDetail;
}

interface HabitCheckToolDetails {
  kind: "habit_check";
  habitId: string;
  found: boolean;
  result?: HabitCheckResult;
}

interface HabitDeleteToolDetails {
  kind: "habit_delete";
  habitId: string;
  found: boolean;
  deleted: boolean;
  result?: DeleteHabitResult;
}

interface HabitMutationToolDependencies {
  getHabitService: () => Promise<HabitService>;
  getProjectService: () => Promise<ProjectService>;
}

const createHabitCreateToolDefinition = ({
  getHabitService,
  getProjectService,
}: HabitMutationToolDependencies) => ({
  name: "habit_create",
  label: "Habit Create",
  description: "Create a habit.",
  promptSnippet: "Create a habit through the native habit service.",
  promptGuidelines: [
    "Use this tool for backend habit creation in normal chat.",
    "Provide an explicit project ID when known.",
    "If only a project name is available, pass the exact unique project name so the tool can resolve it.",
    "Provide normalized RRULE schedule strings instead of natural-language schedules.",
  ],
  parameters: HabitCreateParams,
  async execute(_toolCallId: string, params: HabitCreateToolParams) {
    try {
      const projectService = await getProjectService();
      const input = await resolveCreateHabitInput(projectService, params);
      const habitService = await getHabitService();
      const habit = await habitService.createHabit(input);
      const details: HabitCreateToolDetails = {
        kind: "habit_create",
        input,
        habit,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitCreateContent(habit) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "habit_create failed"), { cause: error });
    }
  },
});

const createHabitUpdateToolDefinition = ({ getHabitService }: HabitMutationToolDependencies) => ({
  name: "habit_update",
  label: "Habit Update",
  description: "Update a habit's supported fields.",
  promptSnippet: "Update a habit through the native habit service.",
  promptGuidelines: [
    "Use this tool for backend habit updates in normal chat.",
    "Provide normalized RRULE schedule strings instead of natural-language schedules.",
  ],
  parameters: HabitUpdateParams,
  async execute(_toolCallId: string, params: HabitUpdateToolParams) {
    try {
      const habitService = await getHabitService();
      const input = normalizeUpdateHabitInput(params);
      const habit = await habitService.updateHabit(input);
      const details: HabitUpdateToolDetails = {
        kind: "habit_update",
        input,
        habit,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitUpdateContent(habit, input) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "habit_update failed"), { cause: error });
    }
  },
});

const createHabitCheckToolDefinition = ({ getHabitService }: HabitMutationToolDependencies) => ({
  name: "habit_check",
  label: "Habit Check",
  description: "Check in a habit for today or toggle today's check-in.",
  promptSnippet: "Check in a habit through the native habit service.",
  promptGuidelines: [
    "Use this tool to check in or toggle a habit for today.",
    "Provide the habit ID explicitly.",
  ],
  parameters: HabitCheckParams,
  async execute(_toolCallId: string, params: HabitCheckToolParams) {
    const habitId = normalizeRequiredText(params.habitId, "habitId");

    try {
      const habitService = await getHabitService();
      const result = await habitService.checkHabit(habitId);
      const details: HabitCheckToolDetails = {
        kind: "habit_check",
        habitId,
        found: true,
        result,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitCheckContent(result) }],
        details,
      };
    } catch (error) {
      if (isHabitNotFoundError(error)) {
        const details: HabitCheckToolDetails = {
          kind: "habit_check",
          habitId,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Habit not found: ${habitId}` }],
          details,
        };
      }

      throw new Error(formatToolError(error, "habit_check failed"), { cause: error });
    }
  },
});

const createHabitDeleteToolDefinition = ({ getHabitService }: HabitMutationToolDependencies) => ({
  name: "habit_delete",
  label: "Habit Delete",
  description: "Delete a habit by explicit ID.",
  promptSnippet: "Delete a habit by explicit ID.",
  promptGuidelines: [
    "Use this tool for backend habit deletion in normal chat.",
    "Provide the habit ID explicitly.",
  ],
  parameters: HabitDeleteParams,
  async execute(_toolCallId: string, params: HabitDeleteToolParams) {
    const habitId = normalizeRequiredText(params.habitId, "habitId");

    try {
      const habitService = await getHabitService();
      const result = await habitService.deleteHabit(habitId);
      const details: HabitDeleteToolDetails = {
        kind: "habit_delete",
        habitId,
        found: true,
        deleted: true,
        result,
      };

      return {
        content: [{ type: "text" as const, text: formatHabitDeleteContent(details) }],
        details,
      };
    } catch (error) {
      if (isHabitNotFoundError(error)) {
        const details: HabitDeleteToolDetails = {
          kind: "habit_delete",
          habitId,
          found: false,
          deleted: false,
        };

        return {
          content: [{ type: "text" as const, text: formatHabitDeleteContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "habit_delete failed"), { cause: error });
    }
  },
});

const registerHabitMutationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: HabitMutationToolDependencies
): void => {
  pi.registerTool(createHabitCreateToolDefinition(dependencies));
  pi.registerTool(createHabitUpdateToolDefinition(dependencies));
  pi.registerTool(createHabitCheckToolDefinition(dependencies));
  pi.registerTool(createHabitDeleteToolDefinition(dependencies));
};

const normalizeCreateHabitInput = (params: HabitCreateToolParams): CreateHabitInput => ({
  title: normalizeRequiredText(params.title, "title"),
  projectId: normalizeRequiredText(params.projectId, "projectId"),
  schedule: normalizeScheduleInput(params.schedule),
  timezone: normalizeRequiredText(params.timezone, "timezone"),
  startDate: normalizeRequiredText(params.startDate, "startDate"),
  description: normalizeOptionalDescription(params, "description"),
  endDate: normalizeOptionalDate(params, "endDate"),
});

const resolveCreateHabitInput = async (
  projectService: ProjectService,
  params: HabitCreateToolParams
): Promise<CreateHabitInput> => {
  const input = normalizeCreateHabitInput(params);
  const project = await resolveProjectForHabitMutation(projectService, input.projectId);

  return {
    ...input,
    projectId: project.id,
  };
};

const normalizeUpdateHabitInput = (params: HabitUpdateToolParams): UpdateHabitInput => {
  const input: UpdateHabitInput = {
    habitId: normalizeRequiredText(params.habitId, "habitId"),
  };

  if (hasOwn(params, "title")) {
    input.title = normalizeRequiredText(params.title ?? "", "title");
  }

  if (hasOwn(params, "schedule")) {
    input.schedule = normalizeScheduleInput(params.schedule ?? "");
  }

  if (hasOwn(params, "timezone")) {
    input.timezone = normalizeRequiredText(params.timezone ?? "", "timezone");
  }

  if (hasOwn(params, "description")) {
    input.description = normalizeNullableText(params.description);
  }

  if (hasOwn(params, "endDate")) {
    input.endDate = normalizeNullableText(params.endDate);
  }

  if (
    input.title === undefined &&
    input.schedule === undefined &&
    input.timezone === undefined &&
    !hasOwn(input, "description") &&
    !hasOwn(input, "endDate")
  ) {
    throw new Error(
      "habit_update requires at least one supported field: title, schedule, timezone, description, or endDate"
    );
  }

  return input;
};

const resolveProjectForHabitMutation = async (
  projectService: ProjectService,
  projectRef: string
): Promise<ProjectSummary> => {
  const project = await projectService.getProject(projectRef);
  if (project) {
    return project;
  }

  const projects = await projectService.listProjects();
  const nameMatches = projects.filter((candidate) => candidate.name === projectRef);
  if (nameMatches.length === 0) {
    throw new Error(`project not found: ${projectRef}`);
  }

  if (nameMatches.length > 1) {
    throw new Error(`multiple projects matched: ${projectRef}`);
  }

  const matchedProject = nameMatches[0];
  if (!matchedProject) {
    throw new Error(`project not found: ${projectRef}`);
  }

  return matchedProject;
};

const normalizeScheduleInput = (value: string): string => {
  const normalizedValue = normalizeRequiredText(value, "schedule");
  const result = validateAndNormalizeScheduleRule(normalizedValue);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value.rule;
};

const normalizeOptionalDescription = <TValue extends { description?: string }>(
  params: TValue,
  fieldName: "description"
): string | null | undefined => {
  if (!hasOwn(params, fieldName)) {
    return undefined;
  }

  return normalizeNullableText(params[fieldName]);
};

const normalizeOptionalDate = <TValue extends { endDate?: string }>(
  params: TValue,
  fieldName: "endDate"
): string | null | undefined => {
  if (!hasOwn(params, fieldName)) {
    return undefined;
  }

  return normalizeNullableText(params[fieldName]);
};

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
};

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const hasOwn = <TObject extends object>(value: TObject, property: keyof TObject): boolean =>
  Object.prototype.hasOwnProperty.call(value, property);

const isHabitNotFoundError = (error: unknown): error is ToduHabitServiceError =>
  error instanceof ToduHabitServiceError && error.causeCode === "not-found";

const formatHabitCreateContent = (habit: HabitDetail): string =>
  [
    `Created habit ${habit.id}: ${habit.title}`,
    `Status: ${habit.paused ? "paused" : "active"}`,
    `Project: ${habit.projectName ?? habit.projectId}`,
  ].join("\n");

const formatHabitUpdateContent = (habit: HabitDetail, input: UpdateHabitInput): string => {
  const changedFields = [
    input.title !== undefined ? `title=${JSON.stringify(input.title)}` : null,
    input.schedule !== undefined ? `schedule=${input.schedule}` : null,
    input.timezone !== undefined ? `timezone=${input.timezone}` : null,
    hasOwn(input, "description")
      ? `description=${input.description === null ? "cleared" : "updated"}`
      : null,
    hasOwn(input, "endDate")
      ? `endDate=${input.endDate === null ? "cleared" : input.endDate}`
      : null,
  ].filter((value): value is string => value !== null);

  return [`Updated habit ${habit.id}: ${habit.title}`, `Changes: ${changedFields.join(", ")}`].join(
    "\n"
  );
};

const formatHabitCheckContent = (result: HabitCheckResult): string => {
  const status = result.completed ? "checked in" : "unchecked";
  return [
    `Habit ${result.habitId}: ${status} for ${result.date}`,
    `Streak: ${result.streak.current} current, ${result.streak.longest} longest, ${result.streak.totalCheckins} total`,
  ].join("\n");
};

const formatHabitDeleteContent = (details: HabitDeleteToolDetails): string =>
  details.found ? `Deleted habit ${details.habitId}.` : `Habit not found: ${details.habitId}`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  HabitCheckToolDetails,
  HabitCreateToolDetails,
  HabitDeleteToolDetails,
  HabitMutationToolDependencies,
  HabitUpdateToolDetails,
};
export {
  createHabitCheckToolDefinition,
  createHabitCreateToolDefinition,
  createHabitDeleteToolDefinition,
  createHabitUpdateToolDefinition,
  normalizeCreateHabitInput,
  normalizeUpdateHabitInput,
  registerHabitMutationTools,
  resolveCreateHabitInput,
  resolveProjectForHabitMutation,
};
