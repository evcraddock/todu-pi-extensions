import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  createInMemoryTaskBrowseFilterStore,
  createTaskBrowseFilterState,
  persistTaskBrowseFilterState,
  restoreTaskBrowseFilterState,
  type TaskBrowseFilterState,
  type TaskBrowseFilterStore,
} from "../services/task-browse-filter-store";

export interface TaskBrowseFilterContextController {
  getState(): TaskBrowseFilterState;
  restoreFromBranch(ctx: ExtensionContext): Promise<void>;
  setState(ctx: ExtensionContext, state: TaskBrowseFilterState): Promise<void>;
  clear(ctx: ExtensionContext): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateTaskBrowseFilterContextControllerDependencies {
  taskBrowseFilterStore?: TaskBrowseFilterStore;
}

const createTaskBrowseFilterContextController = (
  pi: Pick<ExtensionAPI, "appendEntry">,
  dependencies: CreateTaskBrowseFilterContextControllerDependencies = {}
): TaskBrowseFilterContextController => {
  const taskBrowseFilterStore =
    dependencies.taskBrowseFilterStore ?? createInMemoryTaskBrowseFilterStore();

  return {
    getState: () => taskBrowseFilterStore.getState(),

    async restoreFromBranch(ctx: ExtensionContext): Promise<void> {
      taskBrowseFilterStore.replaceState(
        restoreTaskBrowseFilterState(ctx.sessionManager.getBranch())
      );
    },

    async setState(_ctx: ExtensionContext, state: TaskBrowseFilterState): Promise<void> {
      taskBrowseFilterStore.replaceState(state);
      persistTaskBrowseFilterState(pi.appendEntry, state);
    },

    async clear(_ctx: ExtensionContext): Promise<void> {
      const state = createTaskBrowseFilterState();
      taskBrowseFilterStore.replaceState(state);
      persistTaskBrowseFilterState(pi.appendEntry, state);
    },

    async dispose(): Promise<void> {
      taskBrowseFilterStore.clear();
    },
  };
};

let defaultTaskBrowseFilterContextController: TaskBrowseFilterContextController | null = null;

const getDefaultTaskBrowseFilterContextController = (
  pi?: Pick<ExtensionAPI, "appendEntry">
): TaskBrowseFilterContextController => {
  if (!defaultTaskBrowseFilterContextController) {
    if (!pi) {
      throw new Error("Task browse filter context controller has not been initialized");
    }

    defaultTaskBrowseFilterContextController = createTaskBrowseFilterContextController(pi);
  }

  return defaultTaskBrowseFilterContextController;
};

const resetDefaultTaskBrowseFilterContextController = async (): Promise<void> => {
  if (!defaultTaskBrowseFilterContextController) {
    return;
  }

  await defaultTaskBrowseFilterContextController.dispose();
  defaultTaskBrowseFilterContextController = null;
};

export {
  createTaskBrowseFilterContextController,
  getDefaultTaskBrowseFilterContextController,
  resetDefaultTaskBrowseFilterContextController,
};
