export type TaskId = string;
export type ProjectId = string;
export type TaskCommentId = string;

export type TaskStatus = "active" | "inprogress" | "waiting" | "done" | "cancelled";

export type TaskPriority = "low" | "medium" | "high";

export interface ProjectSummary {
  id: ProjectId;
  name: string;
  status: "active" | "done" | "cancelled";
  priority: TaskPriority;
  description: string | null;
}

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
  projectName: string | null;
  labels: string[];
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  comments: TaskComment[];
}

export type TaskSortField = "priority" | "dueDate" | "createdAt" | "updatedAt" | "title";

export type TaskSortDirection = "asc" | "desc";

export interface TaskFilter {
  projectId?: ProjectId | null;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  query?: string;
  from?: string;
  to?: string;
  label?: string;
  overdue?: boolean;
  today?: boolean;
  sort?: TaskSortField;
  sortDirection?: TaskSortDirection;
  timezone?: string;
}
