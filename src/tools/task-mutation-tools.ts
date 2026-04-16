import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type {
  ProjectSummary,
  TaskComment,
  TaskDetail,
  TaskId,
  TaskPriority,
  TaskStatus,
} from "../domain/task";
import { commentOnTask } from "../flows/comment-on-task";
import { createTask } from "../flows/create-task";
import { updateTask } from "../flows/update-task";
import type {
  AddTaskCommentInput,
  CreateTaskInput,
  DeleteTaskResult,
  MoveTaskResult,
  TaskService,
  UpdateTaskInput,
} from "../services/task-service";
import { ToduTaskServiceError } from "../services/todu/todu-task-service";

const TASK_STATUS_VALUES = ["active", "inprogress", "waiting", "done", "cancelled"] as const;
const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;

const TaskCreateParams = Type.Object({
  title: Type.String({ description: "Task title" }),
  projectId: Type.String({ description: "Project ID or unique project name for the new task" }),
  description: Type.Optional(Type.String({ description: "Optional task description" })),
});

const TaskUpdateParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
  title: Type.Optional(Type.String({ description: "Optional replacement task title" })),
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
  assigneeActorIds: Type.Optional(
    Type.Array(Type.String({ description: "Actor ID" }), {
      description: "Optional full replacement assignee actor ID list",
    })
  ),
  addAssigneeActorIds: Type.Optional(
    Type.Array(Type.String({ description: "Actor ID" }), {
      description: "Optional actor IDs to add to the current assignee list",
    })
  ),
  removeAssigneeActorIds: Type.Optional(
    Type.Array(Type.String({ description: "Actor ID" }), {
      description: "Optional actor IDs to remove from the current assignee list",
    })
  ),
});

const TaskCommentCreateParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
  content: Type.String({ description: "Comment content" }),
});

const TaskDeleteParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
});

const TaskMoveParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
  projectId: Type.String({ description: "Target project ID or unique project name" }),
});

interface TaskCreateToolParams {
  title: string;
  projectId: string;
  description?: string;
}

interface TaskUpdateToolParams {
  taskId: TaskId;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string;
  assigneeActorIds?: string[];
  addAssigneeActorIds?: string[];
  removeAssigneeActorIds?: string[];
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

interface TaskDeleteToolParams {
  taskId: string;
}

interface TaskDeleteToolDetails {
  kind: "task_delete";
  taskId: TaskId;
  found: boolean;
  deleted: boolean;
  result?: DeleteTaskResult;
}

interface TaskMoveToolParams {
  taskId: string;
  projectId: string;
}

interface TaskMoveToolDetails {
  kind: "task_move";
  sourceTaskId: TaskId;
  found: boolean;
  moved: boolean;
  result?: MoveTaskResult;
}

interface TaskMutationToolDependencies {
  getTaskService: () => Promise<TaskService>;
}

const createTaskCreateToolDefinition = ({ getTaskService }: TaskMutationToolDependencies) => ({
  name: "task_create",
  label: "Task Create",
  description: "Create a task with a title, project reference, and optional description.",
  promptSnippet: "Create a task when the title and project reference are known.",
  promptGuidelines: [
    "Use this tool for backend task creation in normal chat instead of interactive slash-command flows.",
    "Provide an explicit project ID when known.",
    "If only a project name is available, pass the exact unique project name so the tool can resolve it.",
    "Do not guess project identity.",
  ],
  parameters: TaskCreateParams,
  async execute(_toolCallId: string, params: TaskCreateToolParams) {
    try {
      const taskService = await getTaskService();
      const input = await resolveCreateTaskInput(taskService, params);
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
  description: "Update a task's title, status, priority, description, or assignees.",
  promptSnippet: "Update a task's supported metadata and assignee fields by task ID.",
  promptGuidelines: [
    "Use this tool for backend task updates in normal chat.",
    "Supported fields are title, status, priority, description, and actor-based assignee updates.",
    "Use assigneeActorIds to replace the full assignee list.",
    "Use addAssigneeActorIds or removeAssigneeActorIds for incremental multi-actor assignment changes.",
  ],
  parameters: TaskUpdateParams,
  async execute(_toolCallId: string, params: TaskUpdateToolParams) {
    try {
      const taskService = await getTaskService();
      const input = await resolveUpdateTaskInput(taskService, params);
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

const createTaskDeleteToolDefinition = ({ getTaskService }: TaskMutationToolDependencies) => ({
  name: "task_delete",
  label: "Task Delete",
  description: "Delete a task by explicit ID.",
  promptSnippet: "Delete a task by explicit task ID.",
  promptGuidelines: [
    "Use this tool for backend task deletion in normal chat.",
    "Provide the task ID explicitly.",
    "Do not guess which task to delete.",
  ],
  parameters: TaskDeleteParams,
  async execute(_toolCallId: string, params: TaskDeleteToolParams) {
    const taskId = normalizeRequiredText(params.taskId, "taskId") as TaskId;

    try {
      const taskService = await getTaskService();
      const result = await taskService.deleteTask(taskId);
      const details: TaskDeleteToolDetails = {
        kind: "task_delete",
        taskId,
        found: true,
        deleted: true,
        result,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskDeleteContent(details) }],
        details,
      };
    } catch (error) {
      if (isTaskNotFoundError(error)) {
        const details: TaskDeleteToolDetails = {
          kind: "task_delete",
          taskId,
          found: false,
          deleted: false,
        };

        return {
          content: [{ type: "text" as const, text: formatTaskDeleteContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "task_delete failed"), { cause: error });
    }
  },
});

const createTaskMoveToolDefinition = ({ getTaskService }: TaskMutationToolDependencies) => ({
  name: "task_move",
  label: "Task Move",
  description: "Move a task to a different project.",
  promptSnippet: "Move a task to a different project by task ID and target project reference.",
  promptGuidelines: [
    "Use this tool to move a task between projects in normal chat.",
    "Provide the task ID and target project ID or unique project name explicitly.",
    "The original task is cancelled and a new task is created in the target project.",
  ],
  parameters: TaskMoveParams,
  async execute(_toolCallId: string, params: TaskMoveToolParams) {
    const taskId = normalizeRequiredText(params.taskId, "taskId") as TaskId;
    const projectRef = normalizeRequiredText(params.projectId, "projectId");

    try {
      const taskService = await getTaskService();
      const project = await resolveProjectForTaskCreate(taskService, projectRef);
      const result = await taskService.moveTask({
        taskId,
        targetProjectId: project.id,
      });
      const details: TaskMoveToolDetails = {
        kind: "task_move",
        sourceTaskId: taskId,
        found: true,
        moved: true,
        result,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskMoveContent(details) }],
        details,
      };
    } catch (error) {
      if (isTaskNotFoundError(error)) {
        const details: TaskMoveToolDetails = {
          kind: "task_move",
          sourceTaskId: taskId,
          found: false,
          moved: false,
        };

        return {
          content: [{ type: "text" as const, text: formatTaskMoveContent(details) }],
          details,
        };
      }

      throw new Error(formatToolError(error, "task_move failed"), { cause: error });
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
  pi.registerTool(createTaskDeleteToolDefinition(dependencies));
  pi.registerTool(createTaskMoveToolDefinition(dependencies));
};

const normalizeCreateTaskInput = (params: TaskCreateToolParams): CreateTaskInput => ({
  title: normalizeRequiredText(params.title, "title"),
  projectId: normalizeRequiredText(params.projectId, "projectId"),
  description: normalizeOptionalDescription(params, "description"),
});

const resolveCreateTaskInput = async (
  taskService: TaskService,
  params: TaskCreateToolParams
): Promise<CreateTaskInput> => {
  const input = normalizeCreateTaskInput(params);
  const project = await resolveProjectForTaskCreate(
    taskService,
    normalizeRequiredText(input.projectId ?? "", "projectId")
  );

  return {
    ...input,
    projectId: project.id,
  };
};

const resolveProjectForTaskCreate = async (
  taskService: TaskService,
  projectRef: string
): Promise<ProjectSummary> => {
  const project = await taskService.getProject(projectRef);
  if (project) {
    return project;
  }

  const projects = await taskService.listProjects();
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

const normalizeUpdateTaskInput = (params: TaskUpdateToolParams): UpdateTaskInput => {
  const input: UpdateTaskInput = {
    taskId: normalizeRequiredText(params.taskId, "taskId") as TaskId,
    status: params.status,
    priority: params.priority,
  };

  if (hasOwn(params, "title")) {
    input.title = normalizeRequiredText(params.title ?? "", "title");
  }

  if (hasOwn(params, "description")) {
    input.description = normalizeNullableText(params.description);
  }

  if (hasOwn(params, "assigneeActorIds")) {
    input.assigneeActorIds = normalizeActorIdList(params.assigneeActorIds, "assigneeActorIds");
  }

  if (
    input.title === undefined &&
    input.status === undefined &&
    input.priority === undefined &&
    !hasOwn(input, "description") &&
    !hasOwn(input, "assigneeActorIds")
  ) {
    throw new Error(
      "task_update requires at least one supported field: title, status, priority, description, or assigneeActorIds"
    );
  }

  return input;
};

const resolveUpdateTaskInput = async (
  taskService: TaskService,
  params: TaskUpdateToolParams
): Promise<UpdateTaskInput> => {
  if (params.assigneeActorIds !== undefined) {
    if (params.addAssigneeActorIds !== undefined || params.removeAssigneeActorIds !== undefined) {
      throw new Error(
        "task_update cannot combine assigneeActorIds with addAssigneeActorIds or removeAssigneeActorIds"
      );
    }

    return normalizeUpdateTaskInput(params);
  }

  const addAssigneeActorIds = hasOwn(params, "addAssigneeActorIds")
    ? normalizeActorIdList(params.addAssigneeActorIds, "addAssigneeActorIds")
    : undefined;
  const removeAssigneeActorIds = hasOwn(params, "removeAssigneeActorIds")
    ? normalizeActorIdList(params.removeAssigneeActorIds, "removeAssigneeActorIds")
    : undefined;

  const hasIncrementalAssigneeUpdate =
    addAssigneeActorIds !== undefined || removeAssigneeActorIds !== undefined;

  const baseInput: UpdateTaskInput = {
    taskId: normalizeRequiredText(params.taskId, "taskId") as TaskId,
    status: params.status,
    priority: params.priority,
  };

  if (hasOwn(params, "title")) {
    baseInput.title = normalizeRequiredText(params.title ?? "", "title");
  }

  if (hasOwn(params, "description")) {
    baseInput.description = normalizeNullableText(params.description);
  }

  if (!hasIncrementalAssigneeUpdate) {
    return normalizeUpdateTaskInput(params);
  }

  const task = await taskService.getTask(baseInput.taskId);
  if (!task) {
    throw new Error(`task not found: ${baseInput.taskId}`);
  }

  const nextAssigneeActorIds = new Set(task.assigneeActorIds);
  for (const actorId of addAssigneeActorIds ?? []) {
    nextAssigneeActorIds.add(actorId);
  }
  for (const actorId of removeAssigneeActorIds ?? []) {
    nextAssigneeActorIds.delete(actorId);
  }

  return {
    ...baseInput,
    assigneeActorIds: [...nextAssigneeActorIds],
  };
};

const normalizeTaskCommentInput = (params: TaskCommentCreateToolParams): AddTaskCommentInput => ({
  taskId: normalizeRequiredText(params.taskId, "taskId") as TaskId,
  content: normalizeRequiredText(params.content, "content"),
});

const normalizeActorIdList = (
  values: string[] | undefined,
  fieldName: string
): string[] => {
  if (values === undefined) {
    throw new Error(`${fieldName} is required`);
  }

  const normalizedValues = values.map((value, index) => {
    const normalizedValue = normalizeRequiredText(value ?? "", `${fieldName}[${index}]`);
    return normalizedValue;
  });

  return [...new Set(normalizedValues)];
};

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
    input.title !== undefined ? `title=${JSON.stringify(input.title)}` : null,
    input.status !== undefined ? `status=${input.status}` : null,
    input.priority !== undefined ? `priority=${input.priority}` : null,
    hasOwn(input, "description")
      ? `description=${input.description === null ? "cleared" : "updated"}`
      : null,
    hasOwn(input, "assigneeActorIds")
      ? `assigneeActorIds=${JSON.stringify(input.assigneeActorIds ?? [])}`
      : null,
  ].filter((value): value is string => value !== null);

  return [`Updated task ${task.id}: ${task.title}`, `Changes: ${changedFields.join(", ")}`].join(
    "\n"
  );
};

const formatTaskCommentCreateContent = (comment: TaskComment): string =>
  `Added comment ${comment.id} to task ${comment.taskId}.`;

const formatTaskDeleteContent = (details: TaskDeleteToolDetails): string =>
  details.found ? `Deleted task ${details.taskId}.` : `Task not found: ${details.taskId}`;

const isTaskNotFoundError = (error: unknown): error is ToduTaskServiceError =>
  error instanceof ToduTaskServiceError && error.causeCode === "not-found";

const formatTaskMoveContent = (details: TaskMoveToolDetails): string => {
  if (!details.found) {
    return `Task not found: ${details.sourceTaskId}`;
  }

  const target = details.result?.targetTask;
  const projectLabel = target?.projectName ?? target?.projectId ?? "unknown";
  return [
    `Moved task ${details.sourceTaskId} → ${target?.id ?? "unknown"}`,
    `Target project: ${projectLabel}`,
    `New task: ${target?.id}: ${target?.title}`,
  ].join("\n");
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type {
  TaskCommentCreateToolDetails,
  TaskCreateToolDetails,
  TaskDeleteToolDetails,
  TaskMoveToolDetails,
  TaskMutationToolDependencies,
  TaskUpdateToolDetails,
};
export {
  createTaskCommentCreateToolDefinition,
  createTaskCreateToolDefinition,
  createTaskDeleteToolDefinition,
  createTaskMoveToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeTaskCommentInput,
  normalizeUpdateTaskInput,
  registerTaskMutationTools,
  resolveUpdateTaskInput,
  resolveCreateTaskInput,
  resolveProjectForTaskCreate,
};
