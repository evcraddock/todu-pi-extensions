import type { NoteService } from "../note-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduNoteServiceError extends Error {
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
    this.name = "ToduNoteServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduNoteServiceDependencies {
  client: ToduDaemonClient;
}

const createToduNoteService = ({ client }: ToduNoteServiceDependencies): NoteService => ({
  listNotes: (filter) => runNoteServiceOperation("listNotes", () => client.listNotes(filter)),
  getNote: (noteId) => runNoteServiceOperation("getNote", () => client.getNote(noteId)),
});

const runNoteServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduNoteServiceError({
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

export { createToduNoteService, runNoteServiceOperation };
