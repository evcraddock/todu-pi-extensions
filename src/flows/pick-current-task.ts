import type { TaskId } from "../domain/task";
import type { TaskSessionStore } from "../services/task-session-store";

export interface PickCurrentTaskDependencies {
  taskSessionStore: TaskSessionStore;
}

const pickCurrentTask = (
  { taskSessionStore }: PickCurrentTaskDependencies,
  taskId: TaskId | null
): void => {
  taskSessionStore.setCurrentTask(taskId);
};

export { pickCurrentTask };
