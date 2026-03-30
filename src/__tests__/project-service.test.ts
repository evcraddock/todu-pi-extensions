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
});

describe("createToduProjectService", () => {
  it("delegates project reads to the daemon client", async () => {
    const projects = [createProjectSummary()];
    const client = {
      listProjects: vi.fn().mockResolvedValue(projects),
      getProject: vi.fn().mockResolvedValue(projects[0]),
    } as unknown as {
      listProjects: ProjectService["listProjects"];
      getProject: ProjectService["getProject"];
    };

    const projectService = createToduProjectService({ client: client as never });

    await expect(projectService.listProjects()).resolves.toEqual(projects);
    await expect(projectService.getProject("proj-1")).resolves.toEqual(projects[0]);
    expect(client.listProjects).toHaveBeenCalledWith();
    expect(client.getProject).toHaveBeenCalledWith("proj-1");
  });

  it("wraps daemon client failures in a project-service error", async () => {
    const client = {
      listProjects: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "unavailable",
          method: "project.list",
          message: "project.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
          details: { socketPath: "/tmp/daemon.sock" },
        })
      ),
      getProject: vi.fn(),
    } as unknown as {
      listProjects: ProjectService["listProjects"];
      getProject: ProjectService["getProject"];
    };

    const projectService = createToduProjectService({ client: client as never });

    await expect(projectService.listProjects()).rejects.toEqual(
      expect.objectContaining<ToduProjectServiceError>({
        name: "ToduProjectServiceError",
        operation: "listProjects",
        causeCode: "unavailable",
        message:
          "listProjects failed: project.list failed (DAEMON_UNAVAILABLE): daemon unavailable",
      })
    );
  });
});
