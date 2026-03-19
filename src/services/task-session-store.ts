import type { TaskId } from "../domain/task";

export const TASK_SESSION_ENTRY_TYPE = "todu-current-task";

export interface TaskSessionState {
  currentTaskId: TaskId | null;
}

export interface TaskSessionEntryData {
  currentTaskId: TaskId | null;
}

export interface TaskSessionStateListener {
  (state: TaskSessionState): void;
}

export interface TaskSessionEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}

export interface TaskSessionStore {
  getState(): TaskSessionState;
  replaceState(state: TaskSessionState): void;
  setCurrentTask(taskId: TaskId | null): void;
  clearCurrentTask(): void;
  subscribe(listener: TaskSessionStateListener): { unsubscribe(): void };
}

const createTaskSessionState = (overrides: Partial<TaskSessionState> = {}): TaskSessionState => ({
  currentTaskId: overrides.currentTaskId ?? null,
});

const restoreTaskSessionState = (entries: readonly TaskSessionEntryLike[]): TaskSessionState => {
  let restoredState = createTaskSessionState();

  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== TASK_SESSION_ENTRY_TYPE) {
      continue;
    }

    const data = entry.data as TaskSessionEntryData | undefined;
    restoredState = createTaskSessionState({ currentTaskId: data?.currentTaskId ?? null });
  }

  return restoredState;
};

const persistTaskSessionState = (
  appendEntry: (customType: string, data?: TaskSessionEntryData) => void,
  state: TaskSessionState
): void => {
  appendEntry(TASK_SESSION_ENTRY_TYPE, {
    currentTaskId: state.currentTaskId,
  });
};

const createInMemoryTaskSessionStore = (
  initialState: Partial<TaskSessionState> = {}
): TaskSessionStore => {
  let state = createTaskSessionState(initialState);
  const listeners = new Set<TaskSessionStateListener>();

  const emit = (): void => {
    const snapshot = { ...state };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  return {
    getState: () => ({ ...state }),
    replaceState: (nextState) => {
      state = createTaskSessionState(nextState);
      emit();
    },
    setCurrentTask: (taskId) => {
      state = createTaskSessionState({ currentTaskId: taskId });
      emit();
    },
    clearCurrentTask: () => {
      state = createTaskSessionState();
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener({ ...state });

      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
  };
};

export {
  createInMemoryTaskSessionStore,
  createTaskSessionState,
  persistTaskSessionState,
  restoreTaskSessionState,
};
