import type { TaskComment, TaskDetail, TaskFilter, TaskId, TaskSummary } from "@/domain/task";
import type {
  AddTaskCommentInput,
  CreateTaskInput,
  UpdateTaskInput,
} from "@/services/task-service";
import type { ToduDaemonEventName, ToduDaemonSubscription } from "@/services/todu/daemon-events";

export interface ToduDaemonClient {
  listTasks(filter?: TaskFilter): Promise<TaskSummary[]>;
  getTask(taskId: TaskId): Promise<TaskDetail | null>;
  createTask(input: CreateTaskInput): Promise<TaskDetail>;
  updateTask(input: UpdateTaskInput): Promise<TaskDetail>;
  addTaskComment(input: AddTaskCommentInput): Promise<TaskComment>;
  on(eventName: ToduDaemonEventName, listener: () => void): ToduDaemonSubscription;
}
