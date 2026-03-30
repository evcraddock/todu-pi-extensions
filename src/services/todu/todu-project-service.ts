import type { ProjectSummary } from "../../domain/task";
import type { ProjectService } from "../project-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduProjectServiceError extends Error {
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
    this.name = "ToduProjectServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduProjectServiceDependencies {
  client: ToduDaemonClient;
}

const createToduProjectService = ({ client }: ToduProjectServiceDependencies): ProjectService => ({
  listProjects: () => runProjectServiceOperation("listProjects", () => client.listProjects()),
  getProject: (projectId) =>
    runProjectServiceOperation("getProject", () => client.getProject(projectId)),
});

const runProjectServiceOperation = async <TProjectResult>(
  operation: string,
  action: () => Promise<TProjectResult>
): Promise<TProjectResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduProjectServiceError({
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

const listProjects = async (projectService: ProjectService): Promise<ProjectSummary[]> =>
  projectService.listProjects();

export { createToduProjectService, listProjects, runProjectServiceOperation };
