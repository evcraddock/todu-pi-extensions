import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { stringEnum } from "./string-enum";
import {
  TaskListOutputSchema,
  TaskShowOutputSchema,
  type NormalizedTaskFilter,
} from "./task-read-schemas";
import { createStructuredToolResult, safeToolError } from "./tool-result-contracts";

import type { ImportedContentApproval } from "../domain/approval";
import type {
  OutboundAssigneeWarning,
  TaskComment,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskSortDirection,
  TaskSortField,
  TaskStatus,
  TaskSummary,
} from "../domain/task";
import { browseTasks } from "../flows/browse-tasks";
import { showTaskDetail } from "../flows/show-task-detail";
import type { TaskService } from "../services/task-service";
import { ToduTaskServiceError } from "../services/todu/todu-task-service";
import { formatApprovalSummary } from "../utils/approval-format";
import { getSystemTimezone } from "../utils/timezone";

const TASK_STATUS_VALUES = ["active", "inprogress", "waiting", "done", "cancelled"] as const;
const TASK_PRIORITY_VALUES = ["low", "medium", "high"] as const;
const TASK_SORT_FIELD_VALUES = ["priority", "dueDate", "createdAt", "updatedAt", "title"] as const;
const TASK_SORT_DIRECTION_VALUES = ["asc", "desc"] as const;

const TaskListParams = Type.Object({
  statuses: Type.Optional(
    Type.Array(stringEnum(TASK_STATUS_VALUES), {
      description: "Optional task status filters",
    })
  ),
  priorities: Type.Optional(
    Type.Array(stringEnum(TASK_PRIORITY_VALUES), {
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
    stringEnum(TASK_SORT_FIELD_VALUES, {
      description: "Sort by field (priority, dueDate, createdAt, updatedAt, title)",
    })
  ),
  sortDirection: Type.Optional(
    stringEnum(TASK_SORT_DIRECTION_VALUES, {
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
  outputSchema: TaskListOutputSchema,
  async execute(_toolCallId: string, params: TaskListToolParams) {
    const filter = normalizeTaskListFilter(params);
    let tasks: TaskSummary[];
    try {
      const taskService = await getTaskService();
      tasks = await browseTasks({ taskService }, filter);
    } catch (error) {
      const status = classifyTaskReadError(error, "task_list");
      return createStructuredToolResult({
        outputSchema: TaskListOutputSchema,
        structuredContent: {
          schemaVersion: 1,
          tool: "task_list",
          ok: false,
          status,
          error: safeToolError(status),
          warnings: [],
        },
        text: `task_list failed: ${safeToolError(status).message}`,
        details: undefined,
      });
    }

    const projected = projectTaskReadData(() => tasks.map(projectTaskSummary));
    const details: TaskListToolDetails = {
      kind: "task_list",
      filter,
      tasks: projected,
      total: projected.length,
      empty: projected.length === 0,
    };
    return createStructuredToolResult({
      outputSchema: TaskListOutputSchema,
      structuredContent: {
        schemaVersion: 1,
        tool: "task_list",
        ok: true,
        status: details.empty ? "empty" : "success",
        warnings: [],
        data: { filter, tasks: projected, total: details.total, empty: details.empty },
      },
      text: projectTaskReadData(() => formatTaskListContent(details)),
      details,
    });
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
  outputSchema: TaskShowOutputSchema,
  async execute(_toolCallId: string, params: TaskShowToolParams) {
    let task: TaskDetail | null;
    let failure: "validation_error" | "backend_error" | undefined;
    if (!params.taskId.trim()) {
      failure = "validation_error";
      task = null;
    } else {
      try {
        const taskService = await getTaskService();
        task = await showTaskDetail({ taskService }, params.taskId);
      } catch (error) {
        failure = classifyTaskReadError(error, "task_show");
        task = null;
      }
    }
    if (failure) {
      return createStructuredToolResult({
        outputSchema: TaskShowOutputSchema,
        structuredContent: {
          schemaVersion: 1,
          tool: "task_show",
          ok: false,
          status: failure,
          error: safeToolError(failure),
          warnings: [],
        },
        text: `task_show failed: ${safeToolError(failure).message}`,
        details: undefined,
      });
    }
    if (task === null) {
      const details: TaskShowToolDetails = {
        kind: "task_show",
        taskId: params.taskId,
        found: false,
      };
      return createStructuredToolResult({
        outputSchema: TaskShowOutputSchema,
        structuredContent: {
          schemaVersion: 1,
          tool: "task_show",
          ok: false,
          status: "not_found",
          warnings: [],
          target: { entityType: "task", entityId: params.taskId },
        },
        text: `Task not found: ${params.taskId}`,
        details,
      });
    }

    const projected = projectTaskReadData(() => projectTaskDetail(task));
    const details: TaskShowToolDetails = {
      kind: "task_show",
      taskId: params.taskId,
      found: true,
      task: projected,
    };
    return createStructuredToolResult({
      outputSchema: TaskShowOutputSchema,
      structuredContent: {
        schemaVersion: 1,
        tool: "task_show",
        ok: true,
        status: "success",
        data: { taskId: params.taskId, found: true, task: projected },
        warnings: [
          ...projected.outboundAssigneeWarnings.map((warning) => ({
            code: "unmapped_outbound_assignees",
            message: "Some outbound assignees have no integration mapping.",
            target: { entityType: "task" as const, entityId: projected.id },
            outboundAssigneeWarning: warning,
          })),
          ...(projected.outboundAssigneeWarningsUnavailable
            ? [
                {
                  code: "outbound_assignee_warnings_unavailable",
                  message: "Outbound assignee warning enrichment is unavailable.",
                  target: { entityType: "task" as const, entityId: projected.id },
                },
              ]
            : []),
        ],
      },
      text: projectTaskReadData(() => formatTaskShowContent(projected)),
      details,
    });
  },
});

const registerTaskReadTools = (
  pi: Pick<ExtensionAPI, "registerTool">,
  dependencies: TaskReadToolDependencies
): void => {
  pi.registerTool(createTaskListToolDefinition(dependencies));
  pi.registerTool(createTaskShowToolDefinition(dependencies));
};

const normalizeTaskListFilter = (params: TaskListToolParams): NormalizedTaskFilter => ({
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

  const lines = [`Tasks (${details.total}):`];

  for (const task of details.tasks) {
    lines.push(`- ${formatTaskSummaryLine(task)}`);
  }

  return lines.join("\n");
};

const formatTaskSummaryLine = (task: TaskSummary): string => {
  const projectLabel = task.projectName ?? task.projectId ?? "no project";
  const assigneeLabel =
    task.assigneeDisplayNames.length > 0 ? task.assigneeDisplayNames.join(", ") : "none";
  const dueLabel = task.dueDate ? ` • due: ${task.dueDate}` : "";
  return `${task.id} • ${task.title} • ${task.status} • ${task.priority} • ${projectLabel} • assignees: ${assigneeLabel}${dueLabel}`;
};

const formatTaskShowContent = (task: TaskDetail): string => {
  const lines = [
    `Task ${task.id}: ${task.title}`,
    "",
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    ...(task.dueDate ? [`Due: ${task.dueDate}`] : []),
    `Project: ${task.projectName ?? task.projectId ?? "No project"}`,
    `Assignees: ${task.assigneeDisplayNames.length > 0 ? task.assigneeDisplayNames.join(", ") : "none"}`,
    `Description approval: ${formatApprovalSummary(task.descriptionApproval) ?? "none"}`,
    `Labels: ${task.labels.length > 0 ? task.labels.join(", ") : "none"}`,
    "",
    "Description:",
    task.description?.trim().length ? task.description : "(none)",
    "",
    `Recent comments (${task.comments.length}):`,
  ];

  if (task.comments.length === 0) {
    lines.push("- (none)");
  }

  for (const comment of task.comments) {
    lines.push(
      `- [${comment.createdAt}] ${comment.authorDisplayName}${formatApprovalSummary(comment.contentApproval) ? ` • approval: ${formatApprovalSummary(comment.contentApproval)}` : ""}`
    );
    lines.push(...indentLines(comment.content || "(empty)", 2));
    lines.push("");
  }

  if (task.outboundAssigneeWarnings.length > 0) {
    lines.push("", "Skipped unmapped outbound assignee warnings:");
    for (const warning of task.outboundAssigneeWarnings) {
      lines.push(
        `- ${warning.bindingId} • ${warning.provider}:${warning.targetRef} • ${warning.unmappedAssigneeDisplayNames.join(", ")}`
      );
    }
  }

  if (task.outboundAssigneeWarningsUnavailable) {
    lines.push("", "Warning: Outbound assignee warning enrichment is unavailable.");
  }
  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines.join("\n");
};

const indentLines = (content: string, spaces: number): string[] => {
  const indent = " ".repeat(spaces);
  return content.split(/\r?\n/).map((line) => `${indent}${line}`);
};

const classifyTaskReadError = (
  error: unknown,
  tool: "task_list" | "task_show"
): "validation_error" | "backend_error" => {
  if (error instanceof ToduTaskServiceError) {
    if (error.causeCode === "validation") return "validation_error";
    if (
      [
        "not-found",
        "conflict",
        "precondition-failed",
        "unavailable",
        "timeout",
        "internal",
      ].includes(error.causeCode)
    ) {
      // Enrichment failures (including not-found) do not prove the task itself is absent.
      return "backend_error";
    }
  }
  throw new Error(`${tool} failed: Unexpected task read failure.`);
};

// Keep contract/projection failures outside the service error boundary; never echo payloads.
const projectTaskReadData = <T>(project: () => T): T => {
  try {
    return project();
  } catch {
    throw new Error("Invalid task read data.");
  }
};

const projectTaskSummary = (task: TaskSummary): TaskSummary => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  projectId: task.projectId,
  projectName: task.projectName,
  dueDate: task.dueDate,
  scheduledDate: task.scheduledDate,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  labels: task.labels,
  assigneeActorIds: task.assigneeActorIds,
  assigneeDisplayNames: task.assigneeDisplayNames,
  assignees: task.assignees,
});

const projectApproval = (
  approval: ImportedContentApproval | null
): ImportedContentApproval | null =>
  approval === null
    ? null
    : {
        state: approval.state,
        sourceBindingId: approval.sourceBindingId,
        sourceActorId: approval.sourceActorId,
        sourceFingerprint: approval.sourceFingerprint,
        reviewedAt: approval.reviewedAt,
        reviewedByActorId: approval.reviewedByActorId,
      };

const projectTaskComment = (comment: TaskComment): TaskComment => ({
  id: comment.id,
  taskId: comment.taskId,
  content: comment.content,
  authorActorId: comment.authorActorId,
  authorDisplayName: comment.authorDisplayName,
  author: comment.author,
  createdAt: comment.createdAt,
  contentApproval: projectApproval(comment.contentApproval),
});

const projectAssigneeWarning = (warning: OutboundAssigneeWarning): OutboundAssigneeWarning => ({
  bindingId: warning.bindingId,
  provider: warning.provider,
  targetRef: warning.targetRef,
  unmappedActorIds: warning.unmappedActorIds,
  unmappedAssigneeDisplayNames: warning.unmappedAssigneeDisplayNames,
});

const projectTaskDetail = (task: TaskDetail): TaskDetail => ({
  ...projectTaskSummary(task),
  description: task.description,
  descriptionApproval: projectApproval(task.descriptionApproval),
  comments: task.comments.map(projectTaskComment),
  outboundAssigneeWarnings: task.outboundAssigneeWarnings.map(projectAssigneeWarning),
  ...(task.outboundAssigneeWarningsUnavailable === undefined
    ? {}
    : {
        outboundAssigneeWarningsUnavailable: task.outboundAssigneeWarningsUnavailable,
      }),
});

export type { TaskListToolDetails, TaskShowToolDetails, TaskReadToolDependencies };
export {
  createTaskListToolDefinition,
  createTaskShowToolDefinition,
  formatTaskListContent,
  formatTaskShowContent,
  normalizeTaskListFilter,
  registerTaskReadTools,
};
