import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { RecurringMissPolicy, RecurringTemplateDetail } from "../domain/recurring";
import type { ProjectSummary, TaskPriority } from "../domain/task";
import type { ProjectService } from "../services/project-service";
import type {
  CreateRecurringInput,
  DeleteRecurringResult,
  RecurringService,
  UpdateRecurringInput,
} from "../services/recurring-service";
import { ToduRecurringServiceError } from "../services/todu/todu-recurring-service";
import { validateAndNormalizeScheduleRule } from "../utils/schedule";

const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;
const RECURRING_MISS_POLICY_VALUES = ["accumulate", "rollForward"] as const;

const RecurringCreateParams = Type.Object({
  title: Type.String({ description: "Recurring template title" }),
  projectId: Type.String({ description: "Project ID or unique project name" }),
  schedule: Type.String({ description: "Normalized RRULE schedule string" }),
  timezone: Type.String({ description: "IANA timezone" }),
  startDate: Type.String({ description: "Start date in YYYY-MM-DD format" }),
  description: Type.Optional(
    Type.String({ description: "Optional recurring template description" })
  ),
  priority: Type.Optional(
    StringEnum(TASK_PRIORITY_VALUES, { description: "Optional recurring template priority" })
  ),
  endDate: Type.Optional(
    Type.String({
      description: "Optional end date in YYYY-MM-DD format. Use an empty string to clear it.",
    })
  ),
  missPolicy: Type.Optional(
    StringEnum(RECURRING_MISS_POLICY_VALUES, { description: "Optional recurring miss policy" })
  ),
});

const RecurringUpdateParams = Type.Object({
  recurringId: Type.String({ description: "Recurring template ID" }),
  title: Type.Optional(
    Type.String({ description: "Optional replacement recurring template title" })
  ),
  projectId: Type.Optional(
    Type.String({ description: "Optional replacement project ID or unique project name" })
  ),
  schedule: Type.Optional(
    Type.String({ description: "Optional replacement normalized RRULE schedule string" })
  ),
  timezone: Type.Optional(Type.String({ description: "Optional replacement IANA timezone" })),
  startDate: Type.Optional(
    Type.String({ description: "Optional replacement start date in YYYY-MM-DD format" })
  ),
  description: Type.Optional(
    Type.String({
      description: "Optional replacement description. Use an empty string to clear it.",
    })
  ),
  priority: Type.Optional(
    StringEnum(TASK_PRIORITY_VALUES, {
      description: "Optional replacement recurring template priority",
    })
  ),
  endDate: Type.Optional(
    Type.String({ description: "Optional replacement end date. Use an empty string to clear it." })
  ),
  missPolicy: Type.Optional(
    StringEnum(RECURRING_MISS_POLICY_VALUES, {
      description: "Optional replacement recurring miss policy",
    })
  ),
  paused: Type.Optional(Type.Boolean({ description: "Optional paused state" })),
});

const RecurringDeleteParams = Type.Object({
  recurringId: Type.String({ description: "Recurring template ID" }),
});

interface RecurringCreateToolParams {
  title: string;
  projectId: string;
  schedule: string;
  timezone: string;
  startDate: string;
  description?: string;
  priority?: TaskPriority;
  endDate?: string;
  missPolicy?: RecurringMissPolicy;
}

interface RecurringUpdateToolParams {
  recurringId: string;
  title?: string;
  projectId?: string;
  schedule?: string;
  timezone?: string;
  startDate?: string;
  description?: string;
  priority?: TaskPriority;
  endDate?: string;
  missPolicy?: RecurringMissPolicy;
  paused?: boolean;
}

interface RecurringDeleteToolParams {
  recurringId: string;
}

interface RecurringCreateToolDetails {
  kind: "recurring_create";
  input: CreateRecurringInput;
  template: RecurringTemplateDetail;
}

interface RecurringUpdateToolDetails {
  kind: "recurring_update";
  input: UpdateRecurringInput;
  template: RecurringTemplateDetail;
}

interface RecurringDeleteToolDetails {
  kind: "recurring_delete";
  recurringId: string;
  found: boolean;
  deleted: boolean;
  template?: DeleteRecurringResult;
}

interface RecurringMutationToolDependencies {
  getRecurringService: () => Promise<RecurringService>;
  getProjectService: () => Promise<ProjectService>;
}

const createRecurringCreateToolDefinition = ({
  getRecurringService,
  getProjectService,
}: RecurringMutationToolDependencies) => ({
  name: "recurring_create",
  label: "Recurring Create",
  description: "Create a recurring task template.",
  promptSnippet: "Create a recurring task template through the native recurring service.",
  promptGuidelines: [
    "Use this tool for backend recurring template creation in normal chat.",
    "Provide an explicit project ID when known.",
    "If only a project name is available, pass the exact unique project name so the tool can resolve it.",
    "Provide normalized RRULE schedule strings instead of natural-language schedules.",
  ],
  parameters: RecurringCreateParams,
  async execute(_toolCallId: string, params: RecurringCreateToolParams) {
    try {
      const projectService = await getProjectService();
      const input = await resolveCreateRecurringInput(projectService, params);
      const recurringService = await getRecurringService();
      const template = await recurringService.createRecurring(input);
      const details: RecurringCreateToolDetails = {
        kind: "recurring_create",
        input,
        template,
      };

      return {
        content: [{ type: "text" as const, text: formatRecurringCreateContent(template) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "recurring_create failed"), { cause: error });
    }
  },
});

const createRecurringUpdateToolDefinition = ({
  getRecurringService,
  getProjectService,
}: RecurringMutationToolDependencies) => ({
  name: "recurring_update",
  label: "Recurring Update",
  description: "Update a recurring template's supported fields.",
  promptSnippet: "Update a recurring template through the native recurring service.",
  promptGuidelines: [
    "Use this tool for backend recurring template updates in normal chat.",
    "Do not use it for occurrence previews or forecast helpers.",
    "Provide normalized RRULE schedule strings instead of natural-language schedules.",
  ],
  parameters: RecurringUpdateParams,
  async execute(_toolCallId: string, params: RecurringUpdateToolParams) {
    try {
      const projectService = await getProjectService();
      const input = await resolveUpdateRecurringInput(projectService, params);
      const recurringService = await getRecurringService();
      const template = await recurringService.updateRecurring(input);
      const details: RecurringUpdateToolDetails = {
        kind: "recurring_update",
        input,
        template,
      };

      return {
        content: [{ type: "text" as const, text: formatRecurringUpdateContent(template, input) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "recurring_update failed"), { cause: error });
    }
  },
});

const createRecurringDeleteToolDefinition = ({
  getRecurringService,
}: RecurringMutationToolDependencies) => ({
  name: "recurring_delete",
  label: "Recurring Delete",
  description: "Delete a recurring template by explicit ID.",
  promptSnippet: "Delete a recurring template by explicit ID.",
  promptGuidelines: [
    "Use this tool for backend recurring template deletion in normal chat.",
    "Do not use it for occurrence cleanup or generated-task deletion.",
  ],
  parameters: RecurringDeleteParams,
  async execute(_toolCallId: string, params: RecurringDeleteToolParams) {
    const recurringId = normalizeRequiredText(params.recurringId, "recurringId");

    try {
      const recurringService = await getRecurringService();
      const template = await recurringService.deleteRecurring(recurringId);
      const details: RecurringDeleteToolDetails = {
        kind: "recurring_delete",
        recurringId,
        found: true,
        deleted: true,
        template,
      };

      return {
        content: [{ type: "text" as const, text: formatRecurringDeleteContent(details) }],
        details,
      };
    } catch (error) {
      if (isRecurringNotFoundError(error)) {
        const details: RecurringDeleteToolDetails = {
          kind: "recurring_delete",
          recurringId,
          found: false,
          deleted: false,
        };

        return {
          content: [{ type: "text" as const, text: formatRecurringDeleteContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "recurring_delete failed"), { cause: error });
    }
  },
});

const registerRecurringMutationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: RecurringMutationToolDependencies
): void => {
  pi.registerTool(createRecurringCreateToolDefinition(dependencies));
  pi.registerTool(createRecurringUpdateToolDefinition(dependencies));
  pi.registerTool(createRecurringDeleteToolDefinition(dependencies));
};

const normalizeCreateRecurringInput = (
  params: RecurringCreateToolParams
): CreateRecurringInput => ({
  title: normalizeRequiredText(params.title, "title"),
  projectId: normalizeRequiredText(params.projectId, "projectId"),
  schedule: normalizeScheduleInput(params.schedule),
  timezone: normalizeRequiredText(params.timezone, "timezone"),
  startDate: normalizeRequiredText(params.startDate, "startDate"),
  description: normalizeOptionalDescription(params, "description"),
  priority: params.priority,
  endDate: normalizeOptionalDate(params, "endDate"),
  missPolicy: params.missPolicy,
});

const resolveCreateRecurringInput = async (
  projectService: ProjectService,
  params: RecurringCreateToolParams
): Promise<CreateRecurringInput> => {
  const input = normalizeCreateRecurringInput(params);
  const project = await resolveProjectForRecurringMutation(projectService, input.projectId);

  return {
    ...input,
    projectId: project.id,
  };
};

const resolveUpdateRecurringInput = async (
  projectService: ProjectService,
  params: RecurringUpdateToolParams
): Promise<UpdateRecurringInput> => {
  const input = normalizeUpdateRecurringInput(params);
  if (input.projectId === undefined) {
    return input;
  }

  const project = await resolveProjectForRecurringMutation(projectService, input.projectId);
  return {
    ...input,
    projectId: project.id,
  };
};

const normalizeUpdateRecurringInput = (params: RecurringUpdateToolParams): UpdateRecurringInput => {
  const input: UpdateRecurringInput = {
    recurringId: normalizeRequiredText(params.recurringId, "recurringId"),
    priority: params.priority,
    missPolicy: params.missPolicy,
    paused: params.paused,
  };

  if (hasOwn(params, "title")) {
    input.title = normalizeRequiredText(params.title ?? "", "title");
  }

  if (hasOwn(params, "projectId")) {
    input.projectId = normalizeRequiredText(params.projectId ?? "", "projectId");
  }

  if (hasOwn(params, "schedule")) {
    input.schedule = normalizeScheduleInput(params.schedule ?? "");
  }

  if (hasOwn(params, "timezone")) {
    input.timezone = normalizeRequiredText(params.timezone ?? "", "timezone");
  }

  if (hasOwn(params, "startDate")) {
    input.startDate = normalizeRequiredText(params.startDate ?? "", "startDate");
  }

  if (hasOwn(params, "description")) {
    input.description = normalizeNullableText(params.description);
  }

  if (hasOwn(params, "endDate")) {
    input.endDate = normalizeNullableText(params.endDate);
  }

  if (
    input.title === undefined &&
    input.projectId === undefined &&
    input.schedule === undefined &&
    input.timezone === undefined &&
    input.startDate === undefined &&
    input.priority === undefined &&
    input.missPolicy === undefined &&
    input.paused === undefined &&
    !hasOwn(input, "description") &&
    !hasOwn(input, "endDate")
  ) {
    throw new Error(
      "recurring_update requires at least one supported field: title, projectId, schedule, timezone, startDate, description, priority, endDate, missPolicy, or paused"
    );
  }

  return input;
};

const resolveProjectForRecurringMutation = async (
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

const isRecurringNotFoundError = (error: unknown): error is ToduRecurringServiceError =>
  error instanceof ToduRecurringServiceError && error.causeCode === "not-found";

const formatRecurringCreateContent = (template: RecurringTemplateDetail): string =>
  [
    `Created recurring template ${template.id}: ${template.title}`,
    `Status: ${template.paused ? "paused" : "active"}`,
    `Priority: ${template.priority}`,
    `Project: ${template.projectName ?? template.projectId}`,
  ].join("\n");

const formatRecurringUpdateContent = (
  template: RecurringTemplateDetail,
  input: UpdateRecurringInput
): string => {
  const changedFields = [
    input.title !== undefined ? `title=${JSON.stringify(input.title)}` : null,
    input.projectId !== undefined ? `projectId=${input.projectId}` : null,
    input.schedule !== undefined ? `schedule=${input.schedule}` : null,
    input.timezone !== undefined ? `timezone=${input.timezone}` : null,
    input.startDate !== undefined ? `startDate=${input.startDate}` : null,
    input.priority !== undefined ? `priority=${input.priority}` : null,
    input.missPolicy !== undefined ? `missPolicy=${input.missPolicy}` : null,
    input.paused !== undefined ? `paused=${input.paused}` : null,
    hasOwn(input, "description")
      ? `description=${input.description === null ? "cleared" : "updated"}`
      : null,
    hasOwn(input, "endDate")
      ? `endDate=${input.endDate === null ? "cleared" : input.endDate}`
      : null,
  ].filter((value): value is string => value !== null);

  return [
    `Updated recurring template ${template.id}: ${template.title}`,
    `Changes: ${changedFields.join(", ")}`,
  ].join("\n");
};

const formatRecurringDeleteContent = (details: RecurringDeleteToolDetails): string =>
  details.found
    ? `Deleted recurring template ${details.recurringId}.`
    : `Recurring template not found: ${details.recurringId}`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  RecurringCreateToolDetails,
  RecurringDeleteToolDetails,
  RecurringMutationToolDependencies,
  RecurringUpdateToolDetails,
};
export {
  createRecurringCreateToolDefinition,
  createRecurringDeleteToolDefinition,
  createRecurringUpdateToolDefinition,
  normalizeCreateRecurringInput,
  normalizeUpdateRecurringInput,
  registerRecurringMutationTools,
  resolveCreateRecurringInput,
  resolveProjectForRecurringMutation,
  resolveUpdateRecurringInput,
};
