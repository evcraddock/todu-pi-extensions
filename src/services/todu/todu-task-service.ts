import type {
  OutboundAssigneeWarning,
  TaskDetail,
  TaskFilter,
  TaskSummary,
} from "../../domain/task";
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
  const [tasks, projects, actors] = await Promise.all([
    client.listTasks(filter),
    client.listProjects(),
    listActorsBestEffort(client),
  ]);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  return tasks.map((task) =>
    hydrateTaskSummaryMetadata(task, projectMap.get(task.projectId ?? "") ?? null, actorMap)
  );
};

const hydrateTaskDetailProjectName = async (
  client: ToduDaemonClient,
  task: TaskDetail
): Promise<TaskDetail> => {
  const [project, actors] = await Promise.all([
    task.projectId ? client.getProject(task.projectId) : Promise.resolve(null),
    listActorsBestEffort(client),
  ]);

  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const outboundAssigneeWarnings = task.projectId
    ? await buildOutboundAssigneeWarnings(client, task.projectId, task.assigneeActorIds, actorMap)
    : [];

  return hydrateTaskDetailMetadata(task, project, actorMap, outboundAssigneeWarnings);
};

const listActorsBestEffort = async (client: ToduDaemonClient) => {
  try {
    return await client.listActors();
  } catch {
    return [];
  }
};

const hydrateTaskSummaryMetadata = (
  task: TaskSummary,
  project: { name: string; authorizedAssigneeActorIds: string[] } | null,
  actorMap: Map<string, { displayName: string; archived: boolean }>
): TaskSummary => ({
  ...task,
  projectName: project?.name ?? null,
  assigneeDisplayNames: annotateAssigneeDisplayNames(task, project, actorMap),
});

const hydrateTaskDetailMetadata = (
  task: TaskDetail,
  project: { name: string; authorizedAssigneeActorIds: string[] } | null,
  actorMap: Map<string, { displayName: string; archived: boolean }>,
  outboundAssigneeWarnings: OutboundAssigneeWarning[] = []
): TaskDetail => ({
  ...task,
  projectName: project?.name ?? null,
  assigneeDisplayNames: annotateAssigneeDisplayNames(task, project, actorMap),
  outboundAssigneeWarnings,
});

const annotateAssigneeDisplayNames = (
  task: Pick<TaskSummary, "assigneeActorIds" | "assigneeDisplayNames" | "assignees">,
  project: { authorizedAssigneeActorIds: string[] } | null,
  actorMap: Map<string, { displayName: string; archived: boolean }>
): string[] => {
  const authorizedActorIds = new Set(project?.authorizedAssigneeActorIds ?? []);
  return task.assigneeActorIds.map((actorId, index) => {
    const actor = actorMap.get(actorId);
    const baseLabel =
      task.assigneeDisplayNames[index] ?? task.assignees[index] ?? actor?.displayName ?? actorId;
    const suffixes: string[] = [];
    if (actor?.archived) {
      suffixes.push("archived");
    }
    if (project && !authorizedActorIds.has(actorId)) {
      suffixes.push("unauthorized");
    }

    return suffixes.length > 0 ? `${baseLabel} (${suffixes.join(", ")})` : baseLabel;
  });
};

const buildOutboundAssigneeWarnings = async (
  client: ToduDaemonClient,
  projectId: string,
  assigneeActorIds: string[],
  actorMap: Map<string, { displayName: string; archived: boolean }>
): Promise<OutboundAssigneeWarning[]> => {
  let bindings: Awaited<ReturnType<ToduDaemonClient["listIntegrationBindings"]>> = [];
  try {
    if (typeof client.listIntegrationBindings === "function") {
      bindings = (await client.listIntegrationBindings({ projectId, enabled: true })) ?? [];
    }
  } catch {
    bindings = [];
  }

  return bindings.flatMap((binding) => {
    const mappedActorIds = new Set(
      Array.isArray(binding.options?.actorMappings)
        ? binding.options.actorMappings.map((mapping) => mapping.actorId)
        : []
    );
    const unmappedActorIds = assigneeActorIds.filter((actorId) => !mappedActorIds.has(actorId));
    if (unmappedActorIds.length === 0) {
      return [];
    }

    return [
      {
        bindingId: binding.id,
        provider: binding.provider,
        targetRef: binding.targetRef,
        unmappedActorIds,
        unmappedAssigneeDisplayNames: unmappedActorIds.map(
          (actorId) => actorMap.get(actorId)?.displayName ?? actorId
        ),
      },
    ];
  });
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
