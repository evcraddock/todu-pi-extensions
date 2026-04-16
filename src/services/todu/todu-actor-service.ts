import type { ActorService } from "../actor-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduActorServiceError extends Error {
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
    this.name = "ToduActorServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduActorServiceDependencies {
  client: ToduDaemonClient;
}

const createToduActorService = ({ client }: ToduActorServiceDependencies): ActorService => ({
  listActors: () => runActorServiceOperation("listActors", () => client.listActors()),
  createActor: (input) => runActorServiceOperation("createActor", () => client.createActor(input)),
  renameActor: (input) => runActorServiceOperation("renameActor", () => client.renameActor(input)),
  archiveActor: (actorId) =>
    runActorServiceOperation("archiveActor", () => client.archiveActor(actorId)),
  unarchiveActor: (actorId) =>
    runActorServiceOperation("unarchiveActor", () => client.unarchiveActor(actorId)),
});

const runActorServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduActorServiceError({
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

export { createToduActorService, runActorServiceOperation };
