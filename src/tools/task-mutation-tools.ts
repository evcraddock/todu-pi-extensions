import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type { TaskComment, TaskDetail, TaskId, TaskPriority, TaskStatus } from "../domain/task";
import { commentOnTask } from "../flows/comment-on-task";
import { createTask } from "../flows/create-task";
import { updateTask } from "../flows/update-task";
import type {
  AddTaskCommentInput,
  CreateTaskInput,
  TaskService,
  UpdateTaskInput,
} from "../services/task-service";

const TASK_STATUS_VALUES = ["active", "inprogress", "waiting", "done", "cancelled"] as const;
const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;

const TaskCreateParams = Type.Object({
  title: Type.String({ description: "Task title" }),
  projectId: Type.String({ description: "Project ID for the new task" }),
  description: Type.Optional(Type.String({ description: "Optional task description" })),
});

const TaskUpdateParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
  status: Type.Optional(
    StringEnum(TASK_STATUS_VALUES, { description: "Optional next task status" })
  ),
  priority: Type.Optional(
    StringEnum(TASK_PRIORITY_VALUES, { description: "Optional next task priority" })
  ),
  description: Type.Optional(
    Type.String({
      description: "Optional replacement description. Use an empty string to clear it.",
    })
  ),
});

const TaskCommentCreateParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
  content: Type.String({ description: "Comment content" }),
});

interface TaskCreateToolParams {
  title: string;
  projectId: string;
  description?: string;
}

interface TaskUpdateToolParams {
  taskId: TaskId;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string;
}

interface TaskCommentCreateToolParams {
  taskId: TaskId;
  content: string;
}

interface TaskCreateToolDetails {
  kind: "task_create";
  input: CreateTaskInput;
  task: TaskDetail;
}

interface TaskUpdateToolDetails {
  kind: "task_update";
  input: UpdateTaskInput;
  task: TaskDetail;
}

interface TaskCommentCreateToolDetails {
  kind: "task_comment_create";
  taskId: TaskId;
  comment: TaskComment;
}

interface TaskMutationToolDependencies {
  getTaskService: () => Promise<TaskService>;
}

const createTaskCreateToolDefinition = ({ getTaskService }: TaskMutationToolDependencies) => ({
  name: "task_create",
  label: "Task Create",
  description: "Create a task with a title, project ID, and optional description.",
  promptSnippet: "Create a task when the title and explicit projectId are known.",
  promptGuidelines: [
    "Use this tool for backend task creation in normal chat instead of interactive slash-command flows.",
    "Provide an explicit projectId and do not guess it.",
  ],
  parameters: TaskCreateParams,
  async execute(_toolCallId: string, params: TaskCreateToolParams) {
    try {
      const input = normalizeCreateTaskInput(params);
      const taskService = await getTaskService();
      const task = await createTask({ taskService }, input);
      const details: TaskCreateToolDetails = {
        kind: "task_create",
        input,
        task,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskCreateContent(task) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "task_create failed"), { cause: error });
    }
  },
});

const createTaskUpdateToolDefinition = ({ getTaskService }: TaskMutationToolDependencies) => ({
  name: "task_update",
  label: "Task Update",
  description: "Update a task's status, priority, or description.",
  promptSnippet: "Update a task's supported metadata fields by task ID.",
  promptGuidelines: [
    "Use this tool for backend task updates in normal chat.",
    "In V1, only status, priority, and description are supported.",
  ],
  parameters: TaskUpdateParams,
  async execute(_toolCallId: string, params: TaskUpdateToolParams) {
    try {
      const input = normalizeUpdateTaskInput(params);
      const taskService = await getTaskService();
      const task = await updateTask({ taskService }, input);
      const details: TaskUpdateToolDetails = {
        kind: "task_update",
        input,
        task,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskUpdateContent(task, input) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "task_update failed"), { cause: error });
    }
  },
});

const createTaskCommentCreateToolDefinition = ({
  getTaskService,
}: TaskMutationToolDependencies) => ({
  name: "task_comment_create",
  label: "Task Comment Create",
  description: "Add a comment to a task.",
  promptSnippet: "Add a comment to a task when the task ID and comment content are known.",
  promptGuidelines: [
    "Use this tool to attach task comments in normal chat.",
    "Provide explicit task IDs instead of guessing which task to comment on.",
  ],
  parameters: TaskCommentCreateParams,
  async execute(_toolCallId: string, params: TaskCommentCreateToolParams) {
    try {
      const input = normalizeTaskCommentInput(params);
      const taskService = await getTaskService();
      const comment = await commentOnTask({ taskService }, input);
      const details: TaskCommentCreateToolDetails = {
        kind: "task_comment_create",
        taskId: input.taskId,
        comment,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskCommentCreateContent(comment) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "task_comment_create failed"), { cause: error });
    }
  },
});

const registerTaskMutationTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: TaskMutationToolDependencies
): void => {
  pi.registerTool(createTaskCreateToolDefinition(dependencies));
  pi.registerTool(createTaskUpdateToolDefinition(dependencies));
  pi.registerTool(createTaskCommentCreateToolDefinition(dependencies));
};

const normalizeCreateTaskInput = (params: TaskCreateToolParams): CreateTaskInput => ({
  title: normalizeRequiredText(params.title, "title"),
  projectId: normalizeRequiredText(params.projectId, "projectId"),
  description: normalizeOptionalDescription(params, "description"),
});

const normalizeUpdateTaskInput = (params: TaskUpdateToolParams): UpdateTaskInput => {
  const input: UpdateTaskInput = {
    taskId: normalizeRequiredText(params.taskId, "taskId") as TaskId,
    status: params.status,
    priority: params.priority,
  };

  if (hasOwn(params, "description")) {
    input.description = normalizeNullableText(params.description);
  }

  if (input.status === undefined && input.priority === undefined && !hasOwn(input, "description")) {
    throw new Error(
      "task_update requires at least one supported field: status, priority, or description"
    );
  }

  return input;
};

const normalizeTaskCommentInput = (params: TaskCommentCreateToolParams): AddTaskCommentInput => ({
  taskId: normalizeRequiredText(params.taskId, "taskId") as TaskId,
  content: normalizeRequiredText(params.content, "content"),
});

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
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

const normalizeNullableText = (value: string | null | undefined): string | null => {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const hasOwn = <TObject extends object>(value: TObject, property: keyof TObject): boolean =>
  Object.prototype.hasOwnProperty.call(value, property);

const formatTaskCreateContent = (task: TaskDetail): string =>
  [
    `Created task ${task.id}: ${task.title}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Project: ${task.projectName ?? task.projectId ?? "No project"}`,
  ].join("\n");

const formatTaskUpdateContent = (task: TaskDetail, input: UpdateTaskInput): string => {
  const changedFields = [
    input.status !== undefined ? `status=${input.status}` : null,
    input.priority !== undefined ? `priority=${input.priority}` : null,
    hasOwn(input, "description")
      ? `description=${input.description === null ? "cleared" : "updated"}`
      : null,
  ].filter((value): value is string => value !== null);

  return [`Updated task ${task.id}: ${task.title}`, `Changes: ${changedFields.join(", ")}`].join(
    "\n"
  );
};

const formatTaskCommentCreateContent = (comment: TaskComment): string =>
  `Added comment ${comment.id} to task ${comment.taskId}.`;

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  TaskCommentCreateToolDetails,
  TaskCreateToolDetails,
  TaskMutationToolDependencies,
  TaskUpdateToolDetails,
};
export {
  createTaskCommentCreateToolDefinition,
  createTaskCreateToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeTaskCommentInput,
  normalizeUpdateTaskInput,
  registerTaskMutationTools,
};
