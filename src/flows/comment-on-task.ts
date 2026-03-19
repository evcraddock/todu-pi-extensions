import type { TaskComment } from "../domain/task";
import type { AddTaskCommentInput, TaskService } from "../services/task-service";

export interface CommentOnTaskDependencies {
  taskService: TaskService;
}

const commentOnTask = async (
  { taskService }: CommentOnTaskDependencies,
  input: AddTaskCommentInput
): Promise<TaskComment> => taskService.addTaskComment(input);

export { commentOnTask };
