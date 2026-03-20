import type { TaskDetail, TaskPriority, TaskStatus } from "../../domain/task";

export type TaskDetailActionKind =
  | "pickup"
  | "set-current"
  | "update-status"
  | "update-priority"
  | "comment";

export interface TaskDetailActionItem {
  value: TaskDetailActionKind;
  label: string;
  description: string;
}

export interface TaskDetailViewModel {
  title: string;
  body: string;
  commentCount: number;
}

const DEFAULT_RECENT_COMMENT_LIMIT = 3;

const createTaskDetailViewModel = (
  task: TaskDetail,
  recentCommentLimit = DEFAULT_RECENT_COMMENT_LIMIT
): TaskDetailViewModel => ({
  title: task.title,
  body: createTaskDetailBody(task, recentCommentLimit),
  commentCount: task.comments.length,
});

const createTaskDetailActionItems = (task: TaskDetail): TaskDetailActionItem[] => {
  const items: TaskDetailActionItem[] = [];

  if (task.status === "active") {
    items.push({
      value: "pickup",
      label: "Pick up task",
      description: `Prepare the pickup workflow for ${task.id} and set it as current`,
    });
  }

  items.push(
    {
      value: "set-current",
      label: "Set as current task",
      description: `Use ${task.id} as the active coding context`,
    },
    {
      value: "update-status",
      label: "Update status",
      description: `Change status from ${formatTaskStatusLabel(task.status)}`,
    },
    {
      value: "update-priority",
      label: "Update priority",
      description: `Change priority from ${formatTaskPriorityLabel(task.priority)}`,
    },
    {
      value: "comment",
      label: "Add comment",
      description: "Open the editor to add a progress note or comment",
    }
  );

  return items;
};

const createTaskDetailBody = (task: TaskDetail, recentCommentLimit: number): string => {
  const lines = [
    `ID: ${task.id}`,
    `Status: ${formatTaskStatusLabel(task.status)}`,
    `Priority: ${task.priority}`,
    `Project: ${task.projectName ?? task.projectId ?? "No project"}`,
    `Labels: ${task.labels.length > 0 ? task.labels.join(", ") : "None"}`,
    "",
    "Description",
    task.description?.trim() || "No description",
    "",
    `Recent comments (${task.comments.length})`,
    ...formatRecentComments(task, recentCommentLimit),
  ];

  return lines.join("\n");
};

const formatRecentComments = (task: TaskDetail, recentCommentLimit: number): string[] => {
  if (task.comments.length === 0) {
    return ["No comments yet"];
  }

  return task.comments.slice(-recentCommentLimit).flatMap((comment) => {
    const contentLines = comment.content
      .trim()
      .split("\n")
      .map((line) => (line.trim().length > 0 ? `  ${line}` : "  "));

    return [`- ${comment.author} · ${comment.createdAt}`, ...contentLines];
  });
};

const formatTaskStatusLabel = (status: TaskStatus): string => {
  switch (status) {
    case "inprogress":
      return "In Progress";
    case "cancelled":
      return "Cancelled";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

const formatTaskPriorityLabel = (priority: TaskPriority): string =>
  priority.charAt(0).toUpperCase() + priority.slice(1);

export {
  createTaskDetailActionItems,
  createTaskDetailBody,
  createTaskDetailViewModel,
  DEFAULT_RECENT_COMMENT_LIMIT,
  formatTaskPriorityLabel,
  formatTaskStatusLabel,
};
