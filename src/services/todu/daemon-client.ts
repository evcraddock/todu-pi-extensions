import type {
  Habit as ToduHabit,
  HabitFilter as ToduHabitFilter,
  HabitStreak as ToduHabitStreak,
  IntegrationBinding as ToduIntegrationBinding,
  IntegrationBindingFilter as ToduIntegrationBindingFilter,
  Note as ToduNote,
  Project as ToduProject,
  RecurringFilter as ToduRecurringFilter,
  RecurringTemplate as ToduRecurringTemplate,
  RecurringMissPolicy as ToduRecurringMissPolicy,
  Task as ToduTask,
  TaskPriority as ToduTaskPriority,
  TaskStatus as ToduTaskStatus,
  TaskWithDetail as ToduTaskWithDetail,
} from "@todu/core";

import type { HabitCheckResult, HabitDetail, HabitFilter, HabitSummary } from "../../domain/habit";
import type {
  RecurringFilter,
  RecurringTemplateDetail,
  RecurringTemplateSummary,
} from "../../domain/recurring";
import type {
  ProjectSummary,
  TaskComment,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "../../domain/task";
import type { CreateHabitInput, DeleteHabitResult, UpdateHabitInput } from "../habit-service";
import type {
  CreateIntegrationBindingInput,
  IntegrationBinding,
  IntegrationBindingFilter,
} from "../project-integration-service";
import type {
  CreateProjectInput,
  DeleteProjectResult,
  UpdateProjectInput as UpdateLocalProjectInput,
} from "../project-service";
import type {
  CreateRecurringInput,
  DeleteRecurringResult,
  UpdateRecurringInput,
} from "../recurring-service";
import type {
  AddTaskCommentInput,
  CreateTaskInput,
  DeleteTaskResult,
  UpdateTaskInput,
} from "../task-service";
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
  createProject(input: CreateProjectInput): Promise<ToduProjectSummary>;
  updateProject(input: UpdateLocalProjectInput): Promise<ToduProjectSummary>;
  deleteProject(projectId: string): Promise<DeleteProjectResult>;
  listRecurring(filter?: RecurringFilter): Promise<RecurringTemplateSummary[]>;
  getRecurring(recurringId: string): Promise<RecurringTemplateDetail | null>;
  createRecurring(input: CreateRecurringInput): Promise<RecurringTemplateDetail>;
  updateRecurring(input: UpdateRecurringInput): Promise<RecurringTemplateDetail>;
  deleteRecurring(recurringId: string): Promise<DeleteRecurringResult>;
  listIntegrationBindings(filter?: IntegrationBindingFilter): Promise<IntegrationBinding[]>;
  createIntegrationBinding(input: CreateIntegrationBindingInput): Promise<IntegrationBinding>;
  deleteTask(taskId: TaskId): Promise<DeleteTaskResult>;
  listHabits(filter?: HabitFilter): Promise<HabitSummary[]>;
  getHabit(habitId: string): Promise<HabitDetail | null>;
  createHabit(input: CreateHabitInput): Promise<HabitDetail>;
  updateHabit(input: UpdateHabitInput): Promise<HabitDetail>;
  checkHabit(habitId: string): Promise<HabitCheckResult>;
  deleteHabit(habitId: string): Promise<DeleteHabitResult>;
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

  async deleteTask(taskId: TaskId): Promise<DeleteTaskResult> {
    const result = await connection.request<null>("task.delete", { id: taskId });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("task.delete", result.error);
    }

    return {
      taskId,
      deleted: true,
    };
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

  async createProject(input: CreateProjectInput): Promise<ToduProjectSummary> {
    const result = await connection.request<ToduProject>("project.create", {
      input: mapCreateProjectInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("project.create", result.error);
    }

    return mapProjectSummary(result.value);
  },

  async updateProject(input: UpdateLocalProjectInput): Promise<ToduProjectSummary> {
    const result = await connection.request<ToduProject>("project.update", {
      id: input.projectId,
      input: mapUpdateProjectInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("project.update", result.error);
    }

    return mapProjectSummary(result.value);
  },

  async deleteProject(projectId: string): Promise<DeleteProjectResult> {
    const result = await connection.request<null>("project.delete", { id: projectId });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("project.delete", result.error);
    }

    return {
      projectId,
      deleted: true,
    };
  },

  async listRecurring(filter: RecurringFilter = {}): Promise<RecurringTemplateSummary[]> {
    const result = await connection.request<ToduRecurringTemplate[]>("recurring.list", {
      filter: mapRecurringFilter(filter),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("recurring.list", result.error);
    }

    return result.value.map(mapRecurringTemplateSummary);
  },

  async getRecurring(recurringId: string): Promise<RecurringTemplateDetail | null> {
    const result = await connection.request<ToduRecurringTemplate>("recurring.get", {
      id: recurringId,
    });
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        return null;
      }

      throw mapDaemonErrorToClientError("recurring.get", result.error);
    }

    return mapRecurringTemplateDetail(result.value);
  },

  async createRecurring(input: CreateRecurringInput): Promise<RecurringTemplateDetail> {
    const result = await connection.request<ToduRecurringTemplate>("recurring.create", {
      input: mapCreateRecurringInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("recurring.create", result.error);
    }

    return mapRecurringTemplateDetail(result.value);
  },

  async updateRecurring(input: UpdateRecurringInput): Promise<RecurringTemplateDetail> {
    const result = await connection.request<ToduRecurringTemplate>("recurring.update", {
      id: input.recurringId,
      input: mapUpdateRecurringInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("recurring.update", result.error);
    }

    return mapRecurringTemplateDetail(result.value);
  },

  async deleteRecurring(recurringId: string): Promise<DeleteRecurringResult> {
    const result = await connection.request<null>("recurring.delete", { id: recurringId });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("recurring.delete", result.error);
    }

    return {
      recurringId,
      deleted: true,
    };
  },

  async listIntegrationBindings(
    filter: IntegrationBindingFilter = {}
  ): Promise<IntegrationBinding[]> {
    const result = await connection.request<ToduIntegrationBinding[]>("integration.list", {
      filter: mapIntegrationBindingFilter(filter),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("integration.list", result.error);
    }

    return result.value.map(mapIntegrationBinding);
  },

  async createIntegrationBinding(
    input: CreateIntegrationBindingInput
  ): Promise<IntegrationBinding> {
    const result = await connection.request<ToduIntegrationBinding>("integration.create", {
      input: mapCreateIntegrationBindingInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("integration.create", result.error);
    }

    return mapIntegrationBinding(result.value);
  },

  async listHabits(filter: HabitFilter = {}): Promise<HabitSummary[]> {
    const result = await connection.request<ToduHabit[]>("habit.list", {
      filter: mapHabitFilter(filter),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("habit.list", result.error);
    }

    return result.value.map(mapHabitSummary);
  },

  async getHabit(habitId: string): Promise<HabitDetail | null> {
    const result = await connection.request<ToduHabit>("habit.get", { id: habitId });
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") {
        return null;
      }

      throw mapDaemonErrorToClientError("habit.get", result.error);
    }

    return mapHabitDetail(result.value);
  },

  async createHabit(input: CreateHabitInput): Promise<HabitDetail> {
    const result = await connection.request<ToduHabit>("habit.create", {
      input: mapCreateHabitInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("habit.create", result.error);
    }

    return mapHabitDetail(result.value);
  },

  async updateHabit(input: UpdateHabitInput): Promise<HabitDetail> {
    const result = await connection.request<ToduHabit>("habit.update", {
      id: input.habitId,
      input: mapUpdateHabitInput(input),
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("habit.update", result.error);
    }

    return mapHabitDetail(result.value);
  },

  async checkHabit(habitId: string): Promise<HabitCheckResult> {
    const result = await connection.request<{
      habit: ToduHabit;
      date: string;
      completed: boolean;
      streak: ToduHabitStreak;
    }>("habit.check", {
      id: habitId,
    });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("habit.check", result.error);
    }

    return mapHabitCheckResult(result.value, habitId);
  },

  async deleteHabit(habitId: string): Promise<DeleteHabitResult> {
    const result = await connection.request<null>("habit.delete", { id: habitId });
    if (!result.ok) {
      throw mapDaemonErrorToClientError("habit.delete", result.error);
    }

    return {
      habitId,
      deleted: true,
    };
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

const mapIntegrationBinding = (binding: ToduIntegrationBinding): IntegrationBinding => ({
  id: binding.id,
  provider: binding.provider,
  projectId: binding.projectId,
  targetKind: binding.targetKind,
  targetRef: binding.targetRef,
  strategy: binding.strategy,
  enabled: binding.enabled,
  options: binding.options,
  createdAt: binding.createdAt,
  updatedAt: binding.updatedAt,
});

const mapRecurringTemplateSummary = (
  template: ToduRecurringTemplate
): RecurringTemplateSummary => ({
  id: template.id,
  title: template.title,
  projectId: template.projectId,
  projectName: null,
  priority: toLocalTaskPriority(template.priority),
  schedule: template.schedule,
  timezone: template.timezone,
  startDate: template.startDate,
  endDate: template.endDate ?? null,
  nextDue: template.nextDue,
  missPolicy: toLocalRecurringMissPolicy(template.missPolicy),
  paused: template.paused,
});

const mapRecurringTemplateDetail = (template: ToduRecurringTemplate): RecurringTemplateDetail => ({
  ...mapRecurringTemplateSummary(template),
  description: template.description ?? null,
  labels: [...template.labels],
  skippedDates: [...template.skippedDates],
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

const mapHabitSummary = (habit: ToduHabit): HabitSummary => ({
  id: habit.id,
  title: habit.title,
  projectId: habit.projectId,
  projectName: null,
  schedule: habit.schedule,
  timezone: habit.timezone,
  startDate: habit.startDate,
  endDate: habit.endDate ?? null,
  nextDue: habit.nextDue,
  paused: habit.paused,
});

const mapHabitDetail = (habit: ToduHabit): HabitDetail => ({
  ...mapHabitSummary(habit),
  description: habit.description ?? null,
  createdAt: habit.createdAt,
  updatedAt: habit.updatedAt,
});

const mapHabitCheckResult = (
  result: { habit: ToduHabit; date: string; completed: boolean; streak: ToduHabitStreak },
  habitId: string
): HabitCheckResult => ({
  habitId,
  date: result.date,
  completed: result.completed,
  streak: {
    current: result.streak.current,
    longest: result.streak.longest,
    completedToday: result.streak.completedToday,
    totalCheckins: result.streak.totalCheckins,
  },
});

const mapCreateHabitInput = (input: CreateHabitInput): Record<string, unknown> => ({
  title: input.title,
  projectId: input.projectId,
  schedule: input.schedule,
  timezone: input.timezone,
  startDate: input.startDate,
  description: input.description ?? undefined,
  endDate: input.endDate ?? undefined,
});

const mapUpdateHabitInput = (input: UpdateHabitInput): Record<string, unknown> => ({
  title: input.title ?? undefined,
  schedule: input.schedule ?? undefined,
  timezone: input.timezone ?? undefined,
  description: input.description ?? undefined,
  endDate: input.endDate ?? undefined,
});

const mapHabitFilter = (filter: HabitFilter): ToduHabitFilter => ({
  paused: filter.paused,
  projectId: filter.projectId as ToduHabitFilter["projectId"],
  search: filter.query,
});

const mapCreateProjectInput = (input: CreateProjectInput): Record<string, unknown> => ({
  name: input.name,
  description: input.description ?? undefined,
  priority: input.priority ?? undefined,
});

const mapUpdateProjectInput = (input: UpdateLocalProjectInput): Record<string, unknown> => ({
  name: input.name ?? undefined,
  description: input.description ?? undefined,
  status: input.status ? toRemoteProjectStatus(input.status) : undefined,
  priority: input.priority ?? undefined,
});

const mapCreateRecurringInput = (input: CreateRecurringInput): Record<string, unknown> => ({
  title: input.title,
  projectId: input.projectId,
  schedule: input.schedule,
  timezone: input.timezone,
  startDate: input.startDate,
  description: input.description ?? undefined,
  priority: input.priority ?? undefined,
  endDate: input.endDate ?? undefined,
  missPolicy: input.missPolicy ? toRemoteRecurringMissPolicy(input.missPolicy) : undefined,
});

const mapUpdateRecurringInput = (input: UpdateRecurringInput): Record<string, unknown> => ({
  title: input.title ?? undefined,
  projectId: input.projectId ?? undefined,
  schedule: input.schedule ?? undefined,
  timezone: input.timezone ?? undefined,
  startDate: input.startDate ?? undefined,
  description: input.description ?? undefined,
  priority: input.priority ?? undefined,
  endDate: input.endDate ?? undefined,
  missPolicy: input.missPolicy ? toRemoteRecurringMissPolicy(input.missPolicy) : undefined,
  paused: input.paused ?? undefined,
});

const mapIntegrationBindingFilter = (
  filter: IntegrationBindingFilter
): ToduIntegrationBindingFilter => ({
  provider: filter.provider,
  projectId: filter.projectId as ToduIntegrationBindingFilter["projectId"],
  enabled: filter.enabled,
});

const mapRecurringFilter = (filter: RecurringFilter): ToduRecurringFilter => ({
  paused: filter.paused,
  projectId: filter.projectId as ToduRecurringFilter["projectId"],
  search: filter.query,
});

const mapCreateIntegrationBindingInput = (
  input: CreateIntegrationBindingInput
): Record<string, unknown> => ({
  provider: input.provider,
  projectId: input.projectId,
  targetKind: input.targetKind,
  targetRef: input.targetRef,
  strategy: input.strategy,
  enabled: input.enabled,
  options: input.options,
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

const toLocalRecurringMissPolicy = (
  missPolicy: ToduRecurringMissPolicy | undefined
): RecurringTemplateSummary["missPolicy"] => missPolicy ?? "accumulate";

const toRemoteRecurringMissPolicy = (
  missPolicy: RecurringTemplateSummary["missPolicy"]
): ToduRecurringMissPolicy => missPolicy;

const toRemoteProjectStatus = (status: ProjectSummary["status"]): string =>
  status === "cancelled" ? "canceled" : status;

export {
  createToduDaemonClient,
  mapCreateHabitInput,
  mapCreateIntegrationBindingInput,
  mapCreateProjectInput,
  mapCreateRecurringInput,
  mapDaemonErrorToClientError,
  mapHabitCheckResult,
  mapHabitDetail,
  mapHabitFilter,
  mapHabitSummary,
  mapIntegrationBindingFilter,
  mapRecurringFilter,
  mapRecurringTemplateDetail,
  mapRecurringTemplateSummary,
  mapUpdateHabitInput,
  mapUpdateProjectInput,
  mapUpdateRecurringInput,
  toLocalTaskStatus,
  toRemoteProjectStatus,
  toRemoteTaskStatus,
};
