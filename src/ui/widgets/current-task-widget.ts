import type { TaskId, TaskSummary } from "../../domain/task";
import { formatTaskSummary } from "../../utils/task-format";

export interface CurrentTaskWidgetViewModel {
  title: string;
  subtitle: string;
}

const createCurrentTaskWidgetViewModel = (
  task: TaskSummary | null,
  currentTaskId: TaskId | null = null
): CurrentTaskWidgetViewModel => {
  if (task) {
    return {
      title: task.title,
      subtitle: formatTaskSummary(task),
    };
  }

  if (currentTaskId) {
    return {
      title: "Current task unavailable",
      subtitle: currentTaskId,
    };
  }

  return {
    title: "No current task",
    subtitle: "Select a task to set context",
  };
};

export { createCurrentTaskWidgetViewModel };
