import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { TaskDetail, TaskId } from "../domain/task";
import {
  createInMemoryTaskSessionStore,
  persistTaskSessionState,
  restoreTaskSessionState,
  type TaskSessionStore,
} from "../services/task-session-store";
import {
  getDefaultToduTaskServiceRuntime,
  type ToduTaskServiceRuntime,
} from "../services/todu/default-task-service";
import type { ToduDaemonSubscription } from "../services/todu/daemon-events";
import { createCurrentTaskWidgetViewModel } from "../ui/widgets/current-task-widget";

const CURRENT_TASK_STATUS_KEY = "todu-current-task";
const CURRENT_TASK_WIDGET_KEY = "todu-current-task";

export interface CurrentTaskContextState {
  currentTaskId: TaskId | null;
  currentTask: TaskDetail | null;
}

export interface CurrentTaskContextController {
  getState(): CurrentTaskContextState;
  restoreFromBranch(ctx: ExtensionContext): Promise<void>;
  setCurrentTask(ctx: ExtensionContext, task: TaskDetail | null): Promise<void>;
  clearCurrentTask(ctx: ExtensionContext): Promise<void>;
  handleDataChanged(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateCurrentTaskContextControllerDependencies {
  runtime?: Pick<ToduTaskServiceRuntime, "client" | "ensureConnected">;
  taskSessionStore?: TaskSessionStore;
}

const createCurrentTaskContextController = (
  pi: Pick<ExtensionAPI, "appendEntry">,
  dependencies: CreateCurrentTaskContextControllerDependencies = {}
): CurrentTaskContextController => {
  const runtime = dependencies.runtime ?? getDefaultToduTaskServiceRuntime();
  const taskSessionStore = dependencies.taskSessionStore ?? createInMemoryTaskSessionStore();

  let currentTask: TaskDetail | null = null;
  let activeContext: ExtensionContext | null = null;
  let dataChangedSubscription: ToduDaemonSubscription | null = null;
  let subscribePromise: Promise<ToduDaemonSubscription> | null = null;

  const updateAmbientUi = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) {
      return;
    }

    const { currentTaskId } = taskSessionStore.getState();
    if (!currentTaskId && !currentTask) {
      ctx.ui.setStatus(CURRENT_TASK_STATUS_KEY, undefined);
      ctx.ui.setWidget(CURRENT_TASK_WIDGET_KEY, undefined);
      return;
    }

    const viewModel = createCurrentTaskWidgetViewModel(currentTask, currentTaskId);
    ctx.ui.setWidget(CURRENT_TASK_WIDGET_KEY, [viewModel.title, viewModel.subtitle]);

    if (currentTask) {
      ctx.ui.setStatus(CURRENT_TASK_STATUS_KEY, `${currentTask.id} • ${currentTask.title}`);
      return;
    }

    ctx.ui.setStatus(CURRENT_TASK_STATUS_KEY, currentTaskId ?? undefined);
  };

  const ensureDataChangedSubscription = async (): Promise<void> => {
    if (dataChangedSubscription) {
      return;
    }

    if (subscribePromise) {
      await subscribePromise;
      return;
    }

    subscribePromise = runtime.client
      .on("data.changed", () => {
        void controller.handleDataChanged();
      })
      .then((subscription) => {
        dataChangedSubscription = subscription;
        return subscription;
      })
      .finally(() => {
        subscribePromise = null;
      });

    await subscribePromise;
  };

  const refreshCurrentTask = async (ctx: ExtensionContext): Promise<void> => {
    const { currentTaskId } = taskSessionStore.getState();
    if (!currentTaskId) {
      currentTask = null;
      updateAmbientUi(ctx);
      return;
    }

    try {
      const taskService = await runtime.ensureConnected();
      const task = await taskService.getTask(currentTaskId);
      if (!task || isTerminalCurrentTaskStatus(task.status)) {
        currentTask = null;
        taskSessionStore.clearCurrentTask();
        persistTaskSessionState(pi.appendEntry, taskSessionStore.getState());
        updateAmbientUi(ctx);
        return;
      }

      currentTask = task;
      updateAmbientUi(ctx);
    } catch {
      currentTask = null;
      updateAmbientUi(ctx);
    }
  };

  const controller: CurrentTaskContextController = {
    getState: (): CurrentTaskContextState => ({
      currentTaskId: taskSessionStore.getState().currentTaskId,
      currentTask,
    }),

    async restoreFromBranch(ctx: ExtensionContext): Promise<void> {
      activeContext = ctx;
      taskSessionStore.replaceState(restoreTaskSessionState(ctx.sessionManager.getBranch()));

      if (taskSessionStore.getState().currentTaskId) {
        await ensureDataChangedSubscription();
      }

      await refreshCurrentTask(ctx);
    },

    async setCurrentTask(ctx: ExtensionContext, task: TaskDetail | null): Promise<void> {
      activeContext = ctx;
      currentTask = task;

      if (task) {
        taskSessionStore.setCurrentTask(task.id);
        await ensureDataChangedSubscription();
      } else {
        taskSessionStore.clearCurrentTask();
      }

      persistTaskSessionState(pi.appendEntry, taskSessionStore.getState());
      updateAmbientUi(ctx);
    },

    async clearCurrentTask(ctx: ExtensionContext): Promise<void> {
      await controller.setCurrentTask(ctx, null);
    },

    async handleDataChanged(): Promise<void> {
      if (!activeContext) {
        return;
      }

      await refreshCurrentTask(activeContext);
    },

    async dispose(): Promise<void> {
      dataChangedSubscription?.unsubscribe();
      dataChangedSubscription = null;
      subscribePromise = null;
      activeContext = null;
      currentTask = null;
    },
  };

  return controller;
};

let defaultCurrentTaskContextController: CurrentTaskContextController | null = null;

const getDefaultCurrentTaskContextController = (
  pi?: Pick<ExtensionAPI, "appendEntry">
): CurrentTaskContextController => {
  if (!defaultCurrentTaskContextController) {
    if (!pi) {
      throw new Error("Current task context controller has not been initialized");
    }

    defaultCurrentTaskContextController = createCurrentTaskContextController(pi);
  }

  return defaultCurrentTaskContextController;
};

const isTerminalCurrentTaskStatus = (status: TaskDetail["status"]): boolean =>
  status === "done" || status === "cancelled";

const resetDefaultCurrentTaskContextController = async (): Promise<void> => {
  if (!defaultCurrentTaskContextController) {
    return;
  }

  await defaultCurrentTaskContextController.dispose();
  defaultCurrentTaskContextController = null;
};

export {
  createCurrentTaskContextController,
  CURRENT_TASK_STATUS_KEY,
  CURRENT_TASK_WIDGET_KEY,
  getDefaultCurrentTaskContextController,
  resetDefaultCurrentTaskContextController,
};
