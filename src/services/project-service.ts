import type { ProjectSummary } from "../domain/task";
import type { TaskService } from "./task-service";

export interface ProjectService {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSummary | null>;
}

const createProjectServiceFromTaskService = (taskService: TaskService): ProjectService => ({
  listProjects: () => taskService.listProjects(),
  getProject: (projectId) => taskService.getProject(projectId),
});

export { createProjectServiceFromTaskService };
