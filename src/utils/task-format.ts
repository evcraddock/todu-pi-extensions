import type { TaskDetail, TaskSummary } from "../domain/task";

const formatTaskSummary = (task: TaskSummary): string =>
  [
    task.status,
    task.priority,
    task.projectName ?? task.projectId ?? "no-project",
    task.assigneeDisplayNames.length > 0
      ? `assignees: ${task.assigneeDisplayNames.join(", ")}`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join(" • ");

const formatTaskDetail = (task: TaskDetail): string => {
  const description = task.description?.trim() ?? "No description";
  const assignees =
    task.assigneeDisplayNames.length > 0 ? task.assigneeDisplayNames.join(", ") : "None";
  return `${task.title}\nAssignees: ${assignees}\n${description}`;
};

export { formatTaskDetail, formatTaskSummary };
