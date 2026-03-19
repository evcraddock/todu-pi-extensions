import type { TaskDetail } from "@/domain/task";
import type { CreateTaskInput, TaskService } from "@/services/task-service";

export interface CreateTaskDependencies {
  taskService: TaskService;
}

const createTask = async (
  { taskService }: CreateTaskDependencies,
  input: CreateTaskInput
): Promise<TaskDetail> => taskService.createTask(input);

export { createTask };
