import type { TaskFilter, TaskSummary } from "../domain/task";
import type { TaskService } from "../services/task-service";

export interface BrowseTasksDependencies {
  taskService: TaskService;
}

const browseTasks = async (
  { taskService }: BrowseTasksDependencies,
  filter: TaskFilter = {}
): Promise<TaskSummary[]> => taskService.listTasks(filter);

export { browseTasks };
