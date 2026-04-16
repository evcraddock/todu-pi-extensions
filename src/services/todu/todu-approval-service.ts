import type { ApprovalItem } from "../../domain/approval";
import type { ApprovalService } from "../approval-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduApprovalServiceError extends Error {
  readonly operation: string;
  readonly causeCode: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    operation: string;
    causeCode: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ToduApprovalServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduApprovalServiceDependencies {
  client: ToduDaemonClient;
}

const createToduApprovalService = ({
  client,
}: ToduApprovalServiceDependencies): ApprovalService => ({
  listApprovals: (filter) =>
    runApprovalServiceOperation("listApprovals", () => client.listApprovals(filter)),
  approveTaskDescription: (taskId) =>
    runApprovalServiceOperation("approveTaskDescription", () =>
      client.approveTaskDescription(taskId)
    ),
  approveNoteContent: (noteId) =>
    runApprovalServiceOperation("approveNoteContent", () => client.approveNoteContent(noteId)),
});

const runApprovalServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduApprovalServiceError({
        operation,
        causeCode: error.code,
        message: `${operation} failed: ${error.message}`,
        details: error.details,
        cause: error,
      });
    }

    throw error;
  }
};

export { createToduApprovalService, runApprovalServiceOperation };
export type { ApprovalItem };
