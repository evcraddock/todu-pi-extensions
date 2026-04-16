import type { ActorService } from "../actor-service";
import type { ApprovalService } from "../approval-service";
import type { HabitService } from "../habit-service";
import type { NoteService } from "../note-service";
import type { ProjectIntegrationService } from "../project-integration-service";
import type { ProjectService } from "../project-service";
import type { RecurringService } from "../recurring-service";
import { createRepoContextService } from "../repo-context";
import type { TaskService } from "../task-service";
import { createToduDaemonClient, type ToduDaemonClient } from "./daemon-client";
import {
  createToduDaemonConnection,
  type CreateToduDaemonConnectionOptions,
  type ToduDaemonConnection,
} from "./daemon-connection";
import { createToduActorService } from "./todu-actor-service";
import { createToduProjectIntegrationService } from "./todu-project-integration-service";
import { createToduProjectService } from "./todu-project-service";
import { createToduApprovalService } from "./todu-approval-service";
import { createToduHabitService } from "./todu-habit-service";
import { createToduNoteService } from "./todu-note-service";
import { createToduRecurringService } from "./todu-recurring-service";
import { createToduTaskService } from "./todu-task-service";

export const DEFAULT_TODU_INITIAL_CONNECT_TIMEOUT_MS = 2_000;

export interface ToduTaskServiceRuntime {
  connection: ToduDaemonConnection;
  client: ToduDaemonClient;
  taskService: TaskService;
  actorService: ActorService;
  projectService: ProjectService;
  recurringService: RecurringService;
  habitService: HabitService;
  noteService: NoteService;
  approvalService: ApprovalService;
  projectIntegrationService: ProjectIntegrationService;
  ensureConnected(): Promise<TaskService>;
  ensureActorServiceConnected(): Promise<ActorService>;
  ensureProjectServiceConnected(): Promise<ProjectService>;
  ensureRecurringServiceConnected(): Promise<RecurringService>;
  ensureHabitServiceConnected(): Promise<HabitService>;
  ensureNoteServiceConnected(): Promise<NoteService>;
  ensureApprovalServiceConnected(): Promise<ApprovalService>;
  ensureProjectIntegrationServiceConnected(): Promise<ProjectIntegrationService>;
  disconnect(): Promise<void>;
}

export interface CreateToduTaskServiceRuntimeOptions extends CreateToduDaemonConnectionOptions {
  initialConnectTimeoutMs?: number;
}

const createToduTaskServiceRuntime = (
  options: CreateToduTaskServiceRuntimeOptions = {}
): ToduTaskServiceRuntime => {
  const connection = createToduDaemonConnection(options);
  const client = createToduDaemonClient({ connection });
  const taskService = createToduTaskService({ client });
  const actorService = createToduActorService({ client });
  const projectService = createToduProjectService({ client });
  const recurringService = createToduRecurringService({ client });
  const habitService = createToduHabitService({ client });
  const noteService = createToduNoteService({ client });
  const approvalService = createToduApprovalService({ client });
  const projectIntegrationService = createToduProjectIntegrationService({
    client,
    projectService,
    repoContextService: createRepoContextService(),
  });
  const initialConnectTimeoutMs = normalizeTimeout(
    options.initialConnectTimeoutMs,
    DEFAULT_TODU_INITIAL_CONNECT_TIMEOUT_MS
  );

  return {
    connection,
    client,
    taskService,
    actorService,
    projectService,
    recurringService,
    habitService,
    noteService,
    approvalService,
    projectIntegrationService,
    ensureConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return taskService;
    },
    ensureActorServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return actorService;
    },
    ensureProjectServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return projectService;
    },
    ensureRecurringServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return recurringService;
    },
    ensureHabitServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return habitService;
    },
    ensureNoteServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return noteService;
    },
    ensureApprovalServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return approvalService;
    },
    ensureProjectIntegrationServiceConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return projectIntegrationService;
    },
    disconnect: () => connection.disconnect(),
  };
};

let defaultToduTaskServiceRuntime: ToduTaskServiceRuntime | null = null;

const getDefaultToduTaskServiceRuntime = (): ToduTaskServiceRuntime => {
  if (!defaultToduTaskServiceRuntime) {
    defaultToduTaskServiceRuntime = createToduTaskServiceRuntime();
  }

  return defaultToduTaskServiceRuntime;
};

const resetDefaultToduTaskServiceRuntime = async (): Promise<void> => {
  if (defaultToduTaskServiceRuntime) {
    await defaultToduTaskServiceRuntime.disconnect();
    defaultToduTaskServiceRuntime = null;
  }
};

const connectWithinTimeout = async (
  connection: ToduDaemonConnection,
  timeoutMs: number
): Promise<void> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      connection.connect(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Timed out connecting to the todu daemon after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    await connection.disconnect();
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const normalizeTimeout = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

export {
  connectWithinTimeout,
  createToduTaskServiceRuntime,
  getDefaultToduTaskServiceRuntime,
  resetDefaultToduTaskServiceRuntime,
};
