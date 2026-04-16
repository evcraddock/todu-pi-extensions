import type { ImportedContentApproval } from "./approval";

export type TaskId = string;
export type ProjectId = string;
export type ActorId = string;
export type TaskCommentId = string;

export type TaskStatus = "active" | "inprogress" | "waiting" | "done" | "cancelled";

export type TaskPriority = "low" | "medium" | "high";

export interface ProjectSummary {
  id: ProjectId;
  name: string;
  status: "active" | "done" | "cancelled";
  priority: TaskPriority;
  description: string | null;
  authorizedAssigneeActorIds: ActorId[];
}

export interface TaskComment {
  id: TaskCommentId;
  taskId: TaskId;
  content: string;
  authorActorId: ActorId | null;
  authorDisplayName: string;
  author: string | null;
  contentApproval: ImportedContentApproval | null;
  createdAt: string;
}

export interface OutboundAssigneeWarning {
  bindingId: string;
  provider: string;
  targetRef: string;
  unmappedActorIds: ActorId[];
  unmappedAssigneeDisplayNames: string[];
}

export interface TaskSummary {
  id: TaskId;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: ProjectId | null;
  projectName: string | null;
  labels: string[];
  assigneeActorIds: ActorId[];
  assigneeDisplayNames: string[];
  assignees: string[];
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  descriptionApproval: ImportedContentApproval | null;
  comments: TaskComment[];
  outboundAssigneeWarnings: OutboundAssigneeWarning[];
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
  updatedFrom?: string;
  updatedTo?: string;
  label?: string;
  overdue?: boolean;
  today?: boolean;
  sort?: TaskSortField;
  sortDirection?: TaskSortDirection;
  timezone?: string;
}
