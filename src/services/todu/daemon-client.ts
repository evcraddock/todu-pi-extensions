import type {
  Note as ToduNote,
  Project as ToduProject,
  Task as ToduTask,
  TaskPriority as ToduTaskPriority,
  TaskStatus as ToduTaskStatus,
  TaskWithDetail as ToduTaskWithDetail,
} from "@todu/core";

import type {
  TaskComment,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "../../domain/task";
import type { AddTaskCommentInput, CreateTaskInput, UpdateTaskInput } from "../task-service";
import type { ToduDaemonConnection, ToduDaemonConnectionError } from "./daemon-connection";
import type {
  ToduDaemonEvent,
  ToduDaemonEventListener,
  ToduDaemonEventName,
  ToduDaemonSubscription,
} from "./daemon-events";

export type ToduDaemonClientErrorCode =
  | "not-found"
  | "validation"
  | "conflict"
  | "precondition-failed"
  | "unavailable"
  | "timeout"
  | "internal";

export class ToduDaemonClientError extends Error {
  readonly code: ToduDaemonClientErrorCode;
  readonly method: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: ToduDaemonClientErrorCode;
    method: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "ToduDaemonClientError";
    this.code = options.code;
    this.method = options.method;
    this.details = options.details;
  }
}

export interface ToduProjectSummary {
  id: string;
  name: string;
  status: "active" | "done" | "cancelled";
  priority: TaskPriority;
  description: string | null;
}

export interface ToduDaemonClient {
  listTasks(filter?: TaskFilter): Promise<TaskSummary[]>;
  getTask(taskId: TaskId): Promise<TaskDetail | null>;
  createTask(input: CreateTaskInput): Promise<TaskDetail>;
  updateTask(input: UpdateTaskInput): Promise<TaskDetail>;
  addTaskComment(input: AddTaskCommentInput): Promise<TaskComment>;
  listProjects(): Promise<ToduProjectSummary[]>;
  getProject(projectId: string): Promise<ToduProjectSummary | null>;
  listTaskComments(taskId: TaskId): Promise<TaskComment[]>;
  on(
    eventName: ToduDaemonEventName,
    listener: ToduDaemonEventListener
  ): Promise<ToduDaemonSubscription>;
}

export interface CreateToduDaemonClientOptions {
  connection: Pick<ToduDaemonConnection, "request" | "subscribeToEvents">;
}

const createToduDaemonClient = ({
  connection,
}: CreateToduDaemonClientOptions): ToduDaemonClient => ({
  async listTasks(filter = {}): Promise<TaskSummary[]> {
    const tasks = await listRawTasks(connection, filter);
    return tasks.map(mapTaskSummary);
  },

  async getTask(taskId: TaskId): Promise<TaskDetail | null> {
    const taskResult = await connection.request<ToduTaskWithDetail>("task.get", { id: taskId });
    if (!taskResult.ok) {
      if (taskResult.error.code === "NOT_FOUND") {
        return null;
      }

      throw mapDaemonErrorToClientError("task.get", taskResult.error);
    }

    const comments = await fetchTaskComments(connection, taskId);
    return mapTaskDetail(taskResult.value, comments);
  },

  async createTask(input: CreateTaskInput): Promise<TaskDetail> {
    const taskResult = await connection.request<ToduTaskWithDetail>("task.create", {
      input: mapCreateTaskInput(input),
    });
    if (!taskResult.ok) {
      throw mapDaemonErrorToClientError("task.create", taskResult.error);
    }

    return mapTaskDetail(taskResult.value, []);
  },

  async updateTask(input: UpdateTaskInput): Promise<TaskDetail> {
    const taskResult = await connection.request<ToduTaskWithDetail>("task.update", {
      id: input.taskId,
      input: mapUpdateTaskInput(input),
    });
    if (!taskResult.ok) {
      throw mapDaemonErrorToClientError("task.update", taskResult.error);
    }

    const comments = await fetchTaskComments(connection, input.taskId);
    return mapTaskDetail(taskResult.value, comments);
  },

  async addTaskComment(input: AddTaskCommentInput): Promise<TaskComment> {
    const noteResult = await connection.request<ToduNote>("note.create", {
      input: {
        content: input.content,
        entityType: "task",
        entityId: input.taskId,
      },
    });
    if (!noteResult.ok) {
      throw mapDaemonErrorToClientError("note.create", noteResult.error);
    }

    return mapTaskComment(noteResult.value);
  },

  async listProjects(): Promise<ToduProjectSummary[]> {
    const result = await connection.request<ToduProject[]>("project.list", {});
    if (!result.ok) {
      throw mapDaemonErrorToClientError("project.list", result.error);
    }

    return result.value.map(mapProjectSummary);
  },

  async getProject(projectId: string): Promise<ToduProjectSummary | null> {
    const result = await connection.request<ToduProject>("project.get", { id: projectId });
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        return null;
      }

      throw mapDaemonErrorToClientError("project.get", result.error);
    }

    return mapProjectSummary(result.value);
  },

  async listTaskComments(taskId: TaskId): Promise<TaskComment[]> {
    return fetchTaskComments(connection, taskId);
  },

  on(
    eventName: ToduDaemonEventName,
    listener: ToduDaemonEventListener
  ): Promise<ToduDaemonSubscription> {
    return connection.subscribeToEvents([eventName], (event: ToduDaemonEvent) => {
      if (event.name === eventName) {
        listener(event);
      }
    });
  },
});

const listRawTasks = async (
  connection: Pick<ToduDaemonConnection, "request">,
  filter: TaskFilter
): Promise<ToduTask[]> => {
  if (filter.query && filter.query.trim().length > 0) {
    const result = await connection.request<ToduTask[]>("task.search", {
      query: filter.query,
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("task.search", result.error);
    }

    return result.value.filter((task) => matchesTaskFilter(task, filter));
  }

  const result = await connection.request<ToduTask[]>("task.list", {
    filter: mapTaskFilter(filter),
  });
  if (!result.ok) {
    throw mapDaemonErrorToClientError("task.list", result.error);
  }

  return result.value.filter((task) => matchesTaskFilter(task, filter));
};

const fetchTaskComments = async (
  connection: Pick<ToduDaemonConnection, "request">,
  taskId: TaskId
): Promise<TaskComment[]> => {
  const result = await connection.request<ToduNote[]>("note.list", {
    filter: {
      entityType: "task",
      entityId: taskId,
    },
  });
  if (!result.ok) {
    throw mapDaemonErrorToClientError("note.list", result.error);
  }

  return result.value.map(mapTaskComment);
};

const mapTaskSummary = (task: ToduTask): TaskSummary => ({
  id: task.id,
  title: task.title,
  status: toLocalTaskStatus(task.status),
  priority: toLocalTaskPriority(task.priority),
  projectId: task.projectId ?? null,
  projectName: null,
  labels: [...task.labels],
});

const mapTaskDetail = (task: ToduTaskWithDetail, comments: TaskComment[]): TaskDetail => ({
  ...mapTaskSummary(task),
  description: task.description ?? null,
  comments,
});

const mapTaskComment = (note: ToduNote): TaskComment => ({
  id: note.id,
  taskId: note.entityId ?? "",
  content: note.content,
  author: note.author,
  createdAt: note.createdAt,
});

const mapProjectSummary = (project: ToduProject): ToduProjectSummary => ({
  id: project.id,
  name: project.name,
  status: toLocalProjectStatus(project.status),
  priority: toLocalTaskPriority(project.priority),
  description: project.description ?? null,
});

const mapTaskFilter = (filter: TaskFilter): Record<string, unknown> => {
  const status =
    filter.statuses && filter.statuses.length > 0
      ? filter.statuses.map(toRemoteTaskStatus)
      : undefined;
  const priority =
    filter.priorities && filter.priorities.length > 0
      ? toRemoteTaskPriority(filter.priorities[0])
      : undefined;

  return {
    projectId: filter.projectId,
    status: status?.length === 1 ? status[0] : status,
    priority,
  };
};

const mapCreateTaskInput = (input: CreateTaskInput): Record<string, unknown> => ({
  title: input.title,
  description: input.description ?? undefined,
  projectId: input.projectId ?? undefined,
  labels: input.labels,
});

const mapUpdateTaskInput = (input: UpdateTaskInput): Record<string, unknown> => ({
  title: input.title ?? undefined,
  status: input.status ? toRemoteTaskStatus(input.status) : undefined,
  priority: input.priority ? toRemoteTaskPriority(input.priority) : undefined,
  description: input.description ?? undefined,
});

const matchesTaskFilter = (task: ToduTask, filter: TaskFilter): boolean => {
  if (filter.projectId && task.projectId !== filter.projectId) {
    return false;
  }

  if (
    filter.statuses &&
    filter.statuses.length > 0 &&
    !filter.statuses.includes(toLocalTaskStatus(task.status))
  ) {
    return false;
  }

  if (
    filter.priorities &&
    filter.priorities.length > 0 &&
    !filter.priorities.includes(toLocalTaskPriority(task.priority))
  ) {
    return false;
  }

  if (filter.query && filter.query.trim().length > 0) {
    const normalizedQuery = filter.query.trim().toLowerCase();
    if (!task.title.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
  }

  return true;
};

const mapDaemonErrorToClientError = (
  method: string,
  error: ToduDaemonConnectionError
): ToduDaemonClientError => {
  const code = toClientErrorCode(error.code);
  return new ToduDaemonClientError({
    code,
    method,
    message: `${method} failed (${error.code}): ${error.message}`,
    details: error.details,
  });
};

const toClientErrorCode = (code: string): ToduDaemonClientErrorCode => {
  switch (code) {
    case "NOT_FOUND":
      return "not-found";
    case "VALIDATION_ERROR":
    case "BAD_REQUEST":
      return "validation";
    case "CONFLICT":
      return "conflict";
    case "PRECONDITION_FAILED":
      return "precondition-failed";
    case "DAEMON_UNAVAILABLE":
      return "unavailable";
    case "TIMEOUT":
      return "timeout";
    default:
      return "internal";
  }
};

const toLocalTaskStatus = (status: ToduTaskStatus): TaskStatus =>
  status === "canceled" ? "cancelled" : status;

const toRemoteTaskStatus = (status: TaskStatus): ToduTaskStatus =>
  status === "cancelled" ? "canceled" : status;

const toLocalProjectStatus = (status: string): ToduProjectSummary["status"] =>
  status === "canceled" ? "cancelled" : status === "done" ? "done" : "active";

const toLocalTaskPriority = (priority: ToduTaskPriority): TaskPriority => priority;

const toRemoteTaskPriority = (priority: TaskPriority): ToduTaskPriority => priority;

export {
  createToduDaemonClient,
  mapDaemonErrorToClientError,
  toLocalTaskStatus,
  toRemoteTaskStatus,
};
