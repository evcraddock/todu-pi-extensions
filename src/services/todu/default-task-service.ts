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
import { createToduProjectIntegrationService } from "./todu-project-integration-service";
import { createToduProjectService } from "./todu-project-service";
import { createToduRecurringService } from "./todu-recurring-service";
import { createToduTaskService } from "./todu-task-service";

export const DEFAULT_TODU_INITIAL_CONNECT_TIMEOUT_MS = 2_000;

export interface ToduTaskServiceRuntime {
  connection: ToduDaemonConnection;
  client: ToduDaemonClient;
  taskService: TaskService;
  projectService: ProjectService;
  recurringService: RecurringService;
  projectIntegrationService: ProjectIntegrationService;
  ensureConnected(): Promise<TaskService>;
  ensureProjectServiceConnected(): Promise<ProjectService>;
  ensureRecurringServiceConnected(): Promise<RecurringService>;
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
  const projectService = createToduProjectService({ client });
  const recurringService = createToduRecurringService({ client });
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
    projectService,
    recurringService,
    projectIntegrationService,
    ensureConnected: async () => {
      if (connection.getState().status !== "connected") {
        await connectWithinTimeout(connection, initialConnectTimeoutMs);
      }

      return taskService;
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
