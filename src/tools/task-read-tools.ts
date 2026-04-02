import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import type {
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskSortDirection,
  TaskSortField,
  TaskStatus,
  TaskSummary,
} from "../domain/task";
import { getSystemTimezone } from "../utils/timezone";
import { browseTasks } from "../flows/browse-tasks";
import { showTaskDetail } from "../flows/show-task-detail";
import type { TaskService } from "../services/task-service";

const TASK_STATUS_VALUES = ["active", "inprogress", "waiting", "done", "cancelled"] as const;
const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;
const TASK_SORT_FIELD_VALUES = ["priority", "dueDate", "createdAt", "updatedAt", "title"] as const;
const TASK_SORT_DIRECTION_VALUES = ["asc", "desc"] as const;
const MAX_TASK_LIST_PREVIEW_COUNT = 25;
const MAX_COMMENT_PREVIEW_COUNT = 5;

const TaskListParams = Type.Object({
  statuses: Type.Optional(
    Type.Array(StringEnum(TASK_STATUS_VALUES), {
      description: "Optional task status filters",
    })
  ),
  priorities: Type.Optional(
    Type.Array(StringEnum(TASK_PRIORITY_VALUES), {
      description: "Optional task priority filters",
    })
  ),
  projectId: Type.Optional(Type.String({ description: "Optional project ID filter" })),
  query: Type.Optional(Type.String({ description: "Optional title search query" })),
  from: Type.Optional(Type.String({ description: "Optional created-at start date (YYYY-MM-DD)" })),
  to: Type.Optional(Type.String({ description: "Optional created-at end date (YYYY-MM-DD)" })),
  updatedFrom: Type.Optional(
    Type.String({ description: "Optional updated-at start date (YYYY-MM-DD)" })
  ),
  updatedTo: Type.Optional(
    Type.String({ description: "Optional updated-at end date (YYYY-MM-DD)" })
  ),
  label: Type.Optional(Type.String({ description: "Optional label filter" })),
  overdue: Type.Optional(Type.Boolean({ description: "Show overdue tasks only" })),
  today: Type.Optional(Type.Boolean({ description: "Show tasks due or scheduled today" })),
  sort: Type.Optional(
    StringEnum(TASK_SORT_FIELD_VALUES, {
      description: "Sort by field (priority, dueDate, createdAt, updatedAt, title)",
    })
  ),
  sortDirection: Type.Optional(
    StringEnum(TASK_SORT_DIRECTION_VALUES, {
      description: "Sort direction (asc or desc)",
    })
  ),
  timezone: Type.Optional(Type.String({ description: "IANA timezone (auto-detected if omitted)" })),
});

const TaskShowParams = Type.Object({
  taskId: Type.String({ description: "Task ID" }),
});

interface TaskListToolParams {
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  projectId?: string;
  query?: string;
  from?: string;
  to?: string;
  updatedFrom?: string;
  updatedTo?: string;
  label?: string;
  overdue?: boolean;
  today?: boolean;
  sort?: TaskSortField;
  sortDirection?: TaskSortDirection;
  timezone?: string;
}

interface TaskShowToolParams {
  taskId: TaskId;
}

interface TaskListToolDetails {
  kind: "task_list";
  filter: TaskFilter;
  tasks: TaskSummary[];
  total: number;
  empty: boolean;
}

interface TaskShowToolDetails {
  kind: "task_show";
  taskId: TaskId;
  found: boolean;
  task?: TaskDetail;
}

interface TaskReadToolDependencies {
  getTaskService: () => Promise<TaskService>;
}

const createTaskListToolDefinition = ({ getTaskService }: TaskReadToolDependencies) => ({
  name: "task_list",
  label: "Task List",
  description:
    "List tasks with optional status, priority, project, title, label, creation-date, updated-date, overdue, today, and sort filters.",
  promptSnippet:
    "List tasks using structured filters for status, priority, project, query, creation date, or updated date.",
  promptGuidelines: [
    "Use this tool for backend task lookups in normal chat instead of slash-command task browsing.",
  ],
  parameters: TaskListParams,
  async execute(_toolCallId: string, params: TaskListToolParams) {
    const filter = normalizeTaskListFilter(params);

    try {
      const taskService = await getTaskService();
      const tasks = await browseTasks({ taskService }, filter);
      const details: TaskListToolDetails = {
        kind: "task_list",
        filter,
        tasks,
        total: tasks.length,
        empty: tasks.length === 0,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskListContent(details) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "task_list failed"), { cause: error });
    }
  },
});

const createTaskShowToolDefinition = ({ getTaskService }: TaskReadToolDependencies) => ({
  name: "task_show",
  label: "Task Show",
  description: "Show task details, including description and recent comments.",
  promptSnippet: "Show details for a specific task by task ID.",
  promptGuidelines: [
    "Use this tool when the user asks for details about a known task ID.",
    "If the task is missing, report the explicit not-found result instead of guessing.",
  ],
  parameters: TaskShowParams,
  async execute(_toolCallId: string, params: TaskShowToolParams) {
    try {
      const taskService = await getTaskService();
      const task = await showTaskDetail({ taskService }, params.taskId);
      if (!task) {
        const details: TaskShowToolDetails = {
          kind: "task_show",
          taskId: params.taskId,
          found: false,
        };

        return {
          content: [{ type: "text" as const, text: `Task not found: ${params.taskId}` }],
          details,
        };
      }

      const details: TaskShowToolDetails = {
        kind: "task_show",
        taskId: params.taskId,
        found: true,
        task,
      };

      return {
        content: [{ type: "text" as const, text: formatTaskShowContent(task) }],
        details,
      };
    } catch (error) {
      throw new Error(formatToolError(error, "task_show failed"), { cause: error });
    }
  },
});

const registerTaskReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: TaskReadToolDependencies
): void => {
  pi.registerTool(createTaskListToolDefinition(dependencies));
  pi.registerTool(createTaskShowToolDefinition(dependencies));
};

const normalizeTaskListFilter = (params: TaskListToolParams): TaskFilter => ({
  statuses: normalizeArrayFilter(params.statuses),
  priorities: normalizeArrayFilter(params.priorities),
  projectId: normalizeOptionalText(params.projectId),
  query: normalizeOptionalText(params.query),
  from: normalizeOptionalText(params.from),
  to: normalizeOptionalText(params.to),
  updatedFrom: normalizeOptionalText(params.updatedFrom),
  updatedTo: normalizeOptionalText(params.updatedTo),
  label: normalizeOptionalText(params.label),
  overdue: params.overdue ?? undefined,
  today: params.today ?? undefined,
  sort: params.sort ?? undefined,
  sortDirection: params.sortDirection ?? undefined,
  timezone: normalizeOptionalText(params.timezone) ?? getSystemTimezone(),
});

const normalizeArrayFilter = <TValue extends string>(
  values: TValue[] | undefined
): TValue[] | undefined => (values && values.length > 0 ? [...values] : undefined);

const normalizeOptionalText = (value: string | null | undefined): string | undefined => {
  const trimmedValue = value?.trim();
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined;
};

const formatTaskListContent = (details: TaskListToolDetails): string => {
  if (details.empty) {
    return "No tasks found.";
  }

  const previewTasks = details.tasks.slice(0, MAX_TASK_LIST_PREVIEW_COUNT);
  const lines = [`Tasks (${details.total}):`];

  for (const task of previewTasks) {
    lines.push(`- ${formatTaskSummaryLine(task)}`);
  }

  const remainingCount = details.total - previewTasks.length;
  if (remainingCount > 0) {
    lines.push(`- ... ${remainingCount} more task(s)`);
  }

  return lines.join("\n");
};

const formatTaskSummaryLine = (task: TaskSummary): string => {
  const projectLabel = task.projectName ?? task.projectId ?? "no project";
  return `${task.id} • ${task.title} • ${task.status} • ${task.priority} • ${projectLabel}`;
};

const formatTaskShowContent = (task: TaskDetail): string => {
  const lines = [
    `Task ${task.id}: ${task.title}`,
    "",
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Project: ${task.projectName ?? task.projectId ?? "No project"}`,
    `Labels: ${task.labels.length > 0 ? task.labels.join(", ") : "none"}`,
    "",
    "Description:",
    task.description?.trim().length ? task.description : "(none)",
    "",
    `Recent comments (${task.comments.length}):`,
  ];

  if (task.comments.length === 0) {
    lines.push("- (none)");
    return lines.join("\n");
  }

  const previewComments = task.comments.slice(0, MAX_COMMENT_PREVIEW_COUNT);
  for (const comment of previewComments) {
    lines.push(`- [${comment.createdAt}] ${comment.author}`);
    lines.push(...indentLines(comment.content || "(empty)", 2));
    lines.push("");
  }

  const remainingCount = task.comments.length - previewComments.length;
  if (remainingCount > 0) {
    lines.push(`- ... ${remainingCount} older comment(s) omitted`);
  } else if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.join("\n");
};

const indentLines = (content: string, spaces: number): string[] => {
  const indent = " ".repeat(spaces);
  return content.split(/\r?\n/).map((line) => `${indent}${line}`);
};

const formatToolError = (error: unknown, prefix: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
};

export type { TaskListToolDetails, TaskShowToolDetails, TaskReadToolDependencies };
export {
  createTaskListToolDefinition,
  createTaskShowToolDefinition,
  formatTaskListContent,
  formatTaskShowContent,
  normalizeTaskListFilter,
  registerTaskReadTools,
};
