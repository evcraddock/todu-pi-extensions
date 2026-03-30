import type { ProjectSummary, TaskPriority } from "../domain/task";
import type { TaskService } from "./task-service";

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  priority?: TaskPriority;
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  description?: string | null;
  status?: ProjectSummary["status"];
  priority?: TaskPriority;
}

export interface DeleteProjectResult {
  projectId: string;
  deleted: true;
}

export interface ProjectService {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(input: UpdateProjectInput): Promise<ProjectSummary>;
  deleteProject(projectId: string): Promise<DeleteProjectResult>;
}

const createProjectServiceFromTaskService = (taskService: TaskService): ProjectService => ({
  listProjects: () => taskService.listProjects(),
  getProject: (projectId) => taskService.getProject(projectId),
  createProject: () => Promise.reject(new Error("createProject is not supported by TaskService")),
  updateProject: () => Promise.reject(new Error("updateProject is not supported by TaskService")),
  deleteProject: () => Promise.reject(new Error("deleteProject is not supported by TaskService")),
});

export { createProjectServiceFromTaskService };
