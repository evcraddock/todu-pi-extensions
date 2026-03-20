import type { TaskPriority, TaskStatus } from "../domain/task";

export const TASK_BROWSE_FILTER_ENTRY_TYPE = "todu-task-browse-filter";

export interface TaskBrowseFilterState {
  hasSavedFilter: boolean;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  projectId: string | null;
  projectName: string | null;
}

export interface TaskBrowseFilterEntryData {
  hasSavedFilter?: boolean;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  projectId?: string | null;
  projectName?: string | null;
}

export interface TaskBrowseFilterEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface TaskBrowseFilterStore {
  getState(): TaskBrowseFilterState;
  replaceState(state: TaskBrowseFilterState): void;
  clear(): void;
}

const createTaskBrowseFilterState = (
  overrides: Partial<TaskBrowseFilterState> = {}
): TaskBrowseFilterState => ({
  hasSavedFilter: overrides.hasSavedFilter ?? false,
  status: overrides.status ?? null,
  priority: overrides.priority ?? null,
  projectId: overrides.projectId ?? null,
  projectName: overrides.projectName ?? null,
});

const restoreTaskBrowseFilterState = (
  entries: readonly TaskBrowseFilterEntryLike[]
): TaskBrowseFilterState => {
  let restoredState = createTaskBrowseFilterState();

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== TASK_BROWSE_FILTER_ENTRY_TYPE) {
      continue;
    }

    const data = entry.data as TaskBrowseFilterEntryData | undefined;
    restoredState = createTaskBrowseFilterState({
      hasSavedFilter: data?.hasSavedFilter ?? false,
      status: data?.status ?? null,
      priority: data?.priority ?? null,
      projectId: data?.projectId ?? null,
      projectName: data?.projectName ?? null,
    });
  }

  return restoredState;
};

const persistTaskBrowseFilterState = (
  appendEntry: (customType: string, data?: TaskBrowseFilterEntryData) => void,
  state: TaskBrowseFilterState
): void => {
  appendEntry(TASK_BROWSE_FILTER_ENTRY_TYPE, {
    hasSavedFilter: state.hasSavedFilter,
    status: state.status,
    priority: state.priority,
    projectId: state.projectId,
    projectName: state.projectName,
  });
};

const createInMemoryTaskBrowseFilterStore = (
  initialState: Partial<TaskBrowseFilterState> = {}
): TaskBrowseFilterStore => {
  let state = createTaskBrowseFilterState(initialState);

  return {
    getState: () => ({ ...state }),
    replaceState: (nextState) => {
      state = createTaskBrowseFilterState(nextState);
    },
    clear: () => {
      state = createTaskBrowseFilterState();
    },
  };
};

export {
  createInMemoryTaskBrowseFilterStore,
  createTaskBrowseFilterState,
  persistTaskBrowseFilterState,
  restoreTaskBrowseFilterState,
};
