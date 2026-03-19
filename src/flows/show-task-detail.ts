import type { TaskDetail, TaskId } from "../domain/task";
import type { TaskService } from "../services/task-service";

export interface ShowTaskDetailDependencies {
  taskService: TaskService;
}

const showTaskDetail = async (
  { taskService }: ShowTaskDetailDependencies,
  taskId: TaskId
): Promise<TaskDetail | null> => taskService.getTask(taskId);

export { showTaskDetail };
