import type { ApprovalItem, ApprovalListFilter } from "../domain/approval";

export interface ApprovalService {
  listApprovals(filter?: ApprovalListFilter): Promise<ApprovalItem[]>;
  approveTaskDescription(taskId: string): Promise<ApprovalItem>;
  approveNoteContent(noteId: string): Promise<ApprovalItem>;
}
