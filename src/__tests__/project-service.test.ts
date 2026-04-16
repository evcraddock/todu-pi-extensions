import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import {
  createProjectServiceFromTaskService,
  type ProjectService,
} from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import {
  createToduProjectService,
  ToduProjectServiceError,
} from "@/services/todu/todu-project-service";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  authorizedAssigneeActorIds: [],
  ...overrides,
});

describe("createProjectServiceFromTaskService", () => {
  it("delegates project reads through the existing task service surface", async () => {
    const projects = [createProjectSummary()];
    const taskService = {
      listProjects: vi.fn().mockResolvedValue(projects),
      getProject: vi.fn().mockResolvedValue(projects[0]),
    } as unknown as TaskService;

    const projectService = createProjectServiceFromTaskService(taskService);

    await expect(projectService.listProjects()).resolves.toEqual(projects);
    await expect(projectService.getProject("proj-1")).resolves.toEqual(projects[0]);
    expect(taskService.listProjects).toHaveBeenCalledWith();
    expect(taskService.getProject).toHaveBeenCalledWith("proj-1");
  });

  it("rejects project mutations through the task-service compatibility adapter", async () => {
    const projectService = createProjectServiceFromTaskService({} as TaskService);

    await expect(projectService.createProject({ name: "New Project" })).rejects.toThrow(
      "createProject is not supported by TaskService"
    );
    await expect(
      projectService.updateProject({ projectId: "proj-1", name: "Renamed" })
    ).rejects.toThrow("updateProject is not supported by TaskService");
    await expect(projectService.deleteProject("proj-1")).rejects.toThrow(
      "deleteProject is not supported by TaskService"
    );
  });
});

describe("createToduProjectService", () => {
  it("delegates project reads and mutations to the daemon client", async () => {
    const projects = [createProjectSummary()];
    const createdProject = createProjectSummary({ id: "proj-2", name: "Created Project" });
    const updatedProject = createProjectSummary({ name: "Updated Project", priority: "high" });
    const client = {
      listProjects: vi.fn().mockResolvedValue(projects),
      getProject: vi.fn().mockResolvedValue(projects[0]),
      createProject: vi.fn().mockResolvedValue(createdProject),
      updateProject: vi.fn().mockResolvedValue(updatedProject),
      deleteProject: vi.fn().mockResolvedValue({ projectId: "proj-1", deleted: true }),
    } as unknown as {
      listProjects: ProjectService["listProjects"];
      getProject: ProjectService["getProject"];
      createProject: ProjectService["createProject"];
      updateProject: ProjectService["updateProject"];
      deleteProject: ProjectService["deleteProject"];
    };

    const projectService = createToduProjectService({ client: client as never });

    await expect(projectService.listProjects()).resolves.toEqual(projects);
    await expect(projectService.getProject("proj-1")).resolves.toEqual(projects[0]);
    await expect(projectService.createProject({ name: "Created Project" })).resolves.toEqual(
      createdProject
    );
    await expect(
      projectService.updateProject({ projectId: "proj-1", name: "Updated Project" })
    ).resolves.toEqual(updatedProject);
    await expect(projectService.deleteProject("proj-1")).resolves.toEqual({
      projectId: "proj-1",
      deleted: true,
    });
    expect(client.listProjects).toHaveBeenCalledWith();
    expect(client.getProject).toHaveBeenCalledWith("proj-1");
    expect(client.createProject).toHaveBeenCalledWith({ name: "Created Project" });
    expect(client.updateProject).toHaveBeenCalledWith({
      projectId: "proj-1",
      name: "Updated Project",
    });
    expect(client.deleteProject).toHaveBeenCalledWith("proj-1");
  });

  it("wraps daemon client failures in a project-service error", async () => {
    const client = {
      listProjects: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "validation",
          method: "project.list",
          message: "project.list failed (VALIDATION_ERROR): invalid request",
          details: { field: "filter" },
        })
      ),
      getProject: vi.fn(),
      createProject: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "conflict",
          method: "project.create",
          message: "project.create failed (CONFLICT): duplicate project name",
          details: { name: "Todu Pi Extensions" },
        })
      ),
      updateProject: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "not-found",
          method: "project.update",
          message: "project.update failed (NOT_FOUND): project not found",
          details: { id: "proj-missing" },
        })
      ),
      deleteProject: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "unavailable",
          method: "project.delete",
          message: "project.delete failed (DAEMON_UNAVAILABLE): daemon unavailable",
          details: { socketPath: "/tmp/daemon.sock" },
        })
      ),
    } as unknown as {
      listProjects: ProjectService["listProjects"];
      getProject: ProjectService["getProject"];
      createProject: ProjectService["createProject"];
      updateProject: ProjectService["updateProject"];
      deleteProject: ProjectService["deleteProject"];
    };

    const projectService = createToduProjectService({ client: client as never });

    await expect(projectService.listProjects()).rejects.toEqual(
      expect.objectContaining<ToduProjectServiceError>({
        name: "ToduProjectServiceError",
        operation: "listProjects",
        causeCode: "validation",
        message: "listProjects failed: project.list failed (VALIDATION_ERROR): invalid request",
      })
    );
    await expect(projectService.createProject({ name: "Todu Pi Extensions" })).rejects.toEqual(
      expect.objectContaining<ToduProjectServiceError>({
        name: "ToduProjectServiceError",
        operation: "createProject",
        causeCode: "conflict",
        message: "createProject failed: project.create failed (CONFLICT): duplicate project name",
      })
    );
    await expect(
      projectService.updateProject({ projectId: "proj-missing", name: "Renamed" })
    ).rejects.toEqual(
      expect.objectContaining<ToduProjectServiceError>({
        name: "ToduProjectServiceError",
        operation: "updateProject",
        causeCode: "not-found",
        message: "updateProject failed: project.update failed (NOT_FOUND): project not found",
      })
    );
    await expect(projectService.deleteProject("proj-1")).rejects.toEqual(
      expect.objectContaining<ToduProjectServiceError>({
        name: "ToduProjectServiceError",
        operation: "deleteProject",
        causeCode: "unavailable",
        message:
          "deleteProject failed: project.delete failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );
  });
});
