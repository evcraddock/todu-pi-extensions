import type {
  ProjectSummary,
  TaskComment,
  TaskDetail,
  TaskFilter,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "../domain/task";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  projectId?: string | null;
  labels?: string[];
}

export interface UpdateTaskInput {
  taskId: TaskId;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  description?: string | null;
}

export interface AddTaskCommentInput {
  taskId: TaskId;
  content: string;
}

export interface DeleteTaskResult {
  taskId: TaskId;
  deleted: true;
}

export interface MoveTaskInput {
  taskId: TaskId;
  targetProjectId: string;
}

export interface MoveTaskResult {
  sourceTaskId: TaskId;
  targetTask: TaskDetail;
}

export interface TaskService {
  listTasks(filter?: TaskFilter): Promise<TaskSummary[]>;
  getTask(taskId: TaskId): Promise<TaskDetail | null>;
  createTask(input: CreateTaskInput): Promise<TaskDetail>;
  updateTask(input: UpdateTaskInput): Promise<TaskDetail>;
  addTaskComment(input: AddTaskCommentInput): Promise<TaskComment>;
  // Project reads remain here as compatibility support for existing task flows.
  // Future project-specific work should prefer ProjectService.
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  deleteTask(taskId: TaskId): Promise<DeleteTaskResult>;
  moveTask(input: MoveTaskInput): Promise<MoveTaskResult>;
  listTaskComments(taskId: TaskId): Promise<TaskComment[]>;
}
