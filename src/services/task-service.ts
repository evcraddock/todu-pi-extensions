import type {
  ProjectSummary,
  TaskComment,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "@/domain/task";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  projectId?: string | null;
  labels?: string[];
}

export interface UpdateTaskInput {
  taskId: TaskId;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string | null;
}

export interface AddTaskCommentInput {
  taskId: TaskId;
  content: string;
}

export interface TaskService {
  listTasks(filter?: TaskFilter): Promise<TaskSummary[]>;
  getTask(taskId: TaskId): Promise<TaskDetail | null>;
  createTask(input: CreateTaskInput): Promise<TaskDetail>;
  updateTask(input: UpdateTaskInput): Promise<TaskDetail>;
  addTaskComment(input: AddTaskCommentInput): Promise<TaskComment>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  listTaskComments(taskId: TaskId): Promise<TaskComment[]>;
}
