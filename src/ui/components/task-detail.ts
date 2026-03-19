import type { TaskDetail } from "../../domain/task";
import { formatTaskDetail } from "../../utils/task-format";

export interface TaskDetailViewModel {
  title: string;
  body: string;
  commentCount: number;
}

const createTaskDetailViewModel = (task: TaskDetail): TaskDetailViewModel => ({
  title: task.title,
  body: formatTaskDetail(task),
  commentCount: task.comments.length,
});

export { createTaskDetailViewModel };
