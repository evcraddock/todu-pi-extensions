import type { TaskDetail } from "../domain/task";
import type { TaskService, UpdateTaskInput } from "../services/task-service";

export interface UpdateTaskDependencies {
  taskService: TaskService;
}

const updateTask = async (
  { taskService }: UpdateTaskDependencies,
  input: UpdateTaskInput
): Promise<TaskDetail> => taskService.updateTask(input);

export { updateTask };
