export type ContentApprovalState = "notRequired" | "pendingApproval" | "approved";

export interface ImportedContentApproval {
  state: ContentApprovalState;
  sourceBindingId?: string;
  sourceActorId?: string;
  sourceFingerprint?: string;
  reviewedAt?: string;
  reviewedByActorId?: string;
}

export type ApprovalItemKind = "taskDescription" | "noteContent";

export interface ApprovalItem {
  kind: ApprovalItemKind;
  state: ContentApprovalState;
  taskId?: string;
  noteId?: string;
  projectId?: string;
  taskTitle?: string;
  entityType?: "task" | "project" | "habit";
  entityId?: string;
  contentPreview: string;
  sourceBindingId?: string;
  sourceActorId?: string;
  sourceFingerprint?: string;
  reviewedAt?: string;
  reviewedByActorId?: string;
}

export interface ApprovalListFilter {
  kind?: ApprovalItemKind;
}
