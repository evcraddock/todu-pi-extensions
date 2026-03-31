import type { TaskDetail, TaskFilter, TaskSummary } from "../../domain/task";
import type { TaskService } from "../task-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduTaskServiceError extends Error {
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
    this.name = "ToduTaskServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduTaskServiceDependencies {
  client: ToduDaemonClient;
}

const createToduTaskService = ({ client }: ToduTaskServiceDependencies): TaskService => ({
  listTasks: (filter) =>
    runTaskServiceOperation("listTasks", () => listTasksWithProjectNames(client, filter)),
  getTask: (taskId) =>
    runTaskServiceOperation("getTask", async () => {
      const task = await client.getTask(taskId);
      if (!task) {
        return null;
      }

      return hydrateTaskDetailProjectName(client, task);
    }),
  createTask: (input) =>
    runTaskServiceOperation("createTask", async () => {
      const task = await client.createTask(input);
      return hydrateTaskDetailProjectName(client, task);
    }),
  updateTask: (input) =>
    runTaskServiceOperation("updateTask", async () => {
      const task = await client.updateTask(input);
      return hydrateTaskDetailProjectName(client, task);
    }),
  addTaskComment: (input) =>
    runTaskServiceOperation("addTaskComment", () => client.addTaskComment(input)),
  deleteTask: (taskId) => runTaskServiceOperation("deleteTask", () => client.deleteTask(taskId)),
  moveTask: (input) =>
    runTaskServiceOperation("moveTask", async () => {
      const result = await client.moveTask(input);
      const targetTask = await hydrateTaskDetailProjectName(client, result.targetTask);
      return { ...result, targetTask };
    }),
  listProjects: () => runTaskServiceOperation("listProjects", () => client.listProjects()),
  getProject: (projectId) =>
    runTaskServiceOperation("getProject", () => client.getProject(projectId)),
  listTaskComments: (taskId) =>
    runTaskServiceOperation("listTaskComments", () => client.listTaskComments(taskId)),
});

const listTasksWithProjectNames = async (
  client: ToduDaemonClient,
  filter?: TaskFilter
): Promise<TaskSummary[]> => {
  const [tasks, projects] = await Promise.all([client.listTasks(filter), client.listProjects()]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return tasks.map((task) => ({
    ...task,
    projectName: task.projectId ? (projectNames.get(task.projectId) ?? null) : null,
  }));
};

const hydrateTaskDetailProjectName = async (
  client: ToduDaemonClient,
  task: TaskDetail
): Promise<TaskDetail> => {
  if (!task.projectId) {
    return {
      ...task,
      projectName: null,
    };
  }

  const project = await client.getProject(task.projectId);
  return {
    ...task,
    projectName: project?.name ?? null,
  };
};

const runTaskServiceOperation = async <T>(
  operation: string,
  action: () => Promise<T>
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduTaskServiceError({
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

export {
  createToduTaskService,
  hydrateTaskDetailProjectName,
  listTasksWithProjectNames,
  runTaskServiceOperation,
};
