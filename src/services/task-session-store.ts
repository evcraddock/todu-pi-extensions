import type { TaskId } from "../domain/task";

export interface TaskSessionState {
  currentTaskId: TaskId | null;
}

export interface TaskSessionStore {
  getState(): TaskSessionState;
  setCurrentTask(taskId: TaskId | null): void;
  clearCurrentTask(): void;
}

const createTaskSessionState = (overrides: Partial<TaskSessionState> = {}): TaskSessionState => ({
  currentTaskId: overrides.currentTaskId ?? null,
});

const createInMemoryTaskSessionStore = (
  initialState: Partial<TaskSessionState> = {}
): TaskSessionStore => {
  let state = createTaskSessionState(initialState);

  return {
    getState: () => ({ ...state }),
    setCurrentTask: (taskId) => {
      state = createTaskSessionState({ currentTaskId: taskId });
    },
    clearCurrentTask: () => {
      state = createTaskSessionState();
    },
  };
};

export { createInMemoryTaskSessionStore, createTaskSessionState };
