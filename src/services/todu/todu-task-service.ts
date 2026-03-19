import type { TaskService } from "@/services/task-service";
import type { ToduDaemonClient } from "@/services/todu/daemon-client";

export interface ToduTaskServiceDependencies {
  client: ToduDaemonClient;
}

const createToduTaskService = ({ client }: ToduTaskServiceDependencies): TaskService => ({
  listTasks: (filter) => client.listTasks(filter),
  getTask: (taskId) => client.getTask(taskId),
  createTask: (input) => client.createTask(input),
  updateTask: (input) => client.updateTask(input),
  addTaskComment: (input) => client.addTaskComment(input),
});

export { createToduTaskService };
