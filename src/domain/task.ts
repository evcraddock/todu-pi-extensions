export type TaskId = string;
export type ProjectId = string;
export type TaskCommentId = string;

export type TaskStatus = "active" | "inprogress" | "waiting" | "done" | "cancelled";

export type TaskPriority = "low" | "medium" | "high";

export interface TaskComment {
  id: TaskCommentId;
  taskId: TaskId;
  content: string;
  author: string;
  createdAt: string;
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: ProjectId | null;
  labels: string[];
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  comments: TaskComment[];
}

export interface TaskFilter {
  projectId?: ProjectId | null;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  query?: string;
}
