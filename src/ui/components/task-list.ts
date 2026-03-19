import type { TaskId, TaskSummary } from "@/domain/task";
import { formatTaskSummary } from "@/utils/task-format";

export interface TaskListItem {
  value: TaskId;
  label: string;
  description: string;
}

const createTaskListItem = (task: TaskSummary): TaskListItem => ({
  value: task.id,
  label: task.title,
  description: formatTaskSummary(task),
});

export { createTaskListItem };
