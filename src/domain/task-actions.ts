import type { TaskId, TaskPriority, TaskStatus } from "./task";

export type TaskFlowId =
  | "browse-tasks"
  | "show-task-detail"
  | "create-task"
  | "update-task"
  | "comment-on-task"
  | "pick-current-task";

export interface SetCurrentTaskAction {
  kind: "set-current";
  taskId: TaskId;
}

export interface UpdateTaskStatusAction {
  kind: "update-status";
  taskId: TaskId;
  status: TaskStatus;
}

export interface UpdateTaskPriorityAction {
  kind: "update-priority";
  taskId: TaskId;
  priority: TaskPriority;
}

export interface CommentOnTaskAction {
  kind: "comment";
  taskId: TaskId;
}

export interface CreateTaskAction {
  kind: "create";
}

export type TaskAction =
  | SetCurrentTaskAction
  | UpdateTaskStatusAction
  | UpdateTaskPriorityAction
  | CommentOnTaskAction
  | CreateTaskAction;
