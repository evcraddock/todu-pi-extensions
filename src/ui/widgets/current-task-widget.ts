import type { TaskSummary } from "../../domain/task";

export interface CurrentTaskWidgetViewModel {
  title: string;
  subtitle: string;
}

const createCurrentTaskWidgetViewModel = (
  task: TaskSummary | null
): CurrentTaskWidgetViewModel => ({
  title: task?.title ?? "No current task",
  subtitle: task?.status ?? "Select a task to set context",
});

export { createCurrentTaskWidgetViewModel };
