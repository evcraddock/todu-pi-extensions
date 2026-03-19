import type { TaskDetail, TaskSummary } from "@/domain/task";

const formatTaskSummary = (task: TaskSummary): string =>
  [task.status, task.priority, task.projectName ?? task.projectId ?? "no-project"].join(" • ");

const formatTaskDetail = (task: TaskDetail): string => {
  const description = task.description?.trim() ?? "No description";
  return `${task.title}\n${description}`;
};

export { formatTaskDetail, formatTaskSummary };
