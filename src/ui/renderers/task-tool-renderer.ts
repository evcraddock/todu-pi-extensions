import type { TaskDetail, TaskSummary } from "../../domain/task";
import { formatTaskDetail, formatTaskSummary } from "../../utils/task-format";

const renderTaskList = (tasks: TaskSummary[]): string =>
  tasks.map((task) => `- ${task.title} (${formatTaskSummary(task)})`).join("\n");

const renderTaskDetail = (task: TaskDetail): string => formatTaskDetail(task);

export { renderTaskDetail, renderTaskList };
