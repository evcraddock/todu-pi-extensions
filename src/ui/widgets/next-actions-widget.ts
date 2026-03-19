import type { TaskSummary } from "../../domain/task";

export interface NextActionsWidgetViewModel {
  title: string;
  items: string[];
}

const createNextActionsWidgetViewModel = (tasks: TaskSummary[]): NextActionsWidgetViewModel => ({
  title: "Next actions",
  items: tasks.map((task) => task.title),
});

export { createNextActionsWidgetViewModel };
