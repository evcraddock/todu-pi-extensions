import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { ProjectService } from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import { ToduProjectServiceError } from "@/services/todu/todu-project-service";
import {
  createProjectCreateToolDefinition,
  createProjectDeleteToolDefinition,
  createProjectUpdateToolDefinition,
  normalizeCreateProjectInput,
  normalizeUpdateProjectInput,
} from "@/tools/project-mutation-tools";
import type { ActorService } from "@/services/actor-service";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  authorizedAssigneeActorIds: [],
  ...overrides,
});

describe("registerTools", () => {
  it("registers the native project mutation tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["project_create", "project_update", "project_delete"])
    );
  });
});

describe("normalizeCreateProjectInput", () => {
  it("trims required text fields and normalizes blank descriptions to null", () => {
    expect(
      normalizeCreateProjectInput({
        name: "  Todu Pi Extensions  ",
        description: "   ",
        priority: "high",
      })
    ).toEqual({
      name: "Todu Pi Extensions",
      description: null,
      priority: "high",
    });
  });

  it("rejects blank names", () => {
    expect(() => normalizeCreateProjectInput({ name: "   " })).toThrow("name is required");
  });
});

describe("normalizeUpdateProjectInput", () => {
  it("requires at least one supported mutation field", () => {
    expect(() => normalizeUpdateProjectInput({ projectId: "proj-1" })).toThrow(
      "project_update requires at least one supported field: name, description, status, priority, or authorizedAssigneeActorIds"
    );
  });

  it("trims replacement names and clears blank descriptions", () => {
    expect(
      normalizeUpdateProjectInput({
        projectId: " proj-1 ",
        name: "  Updated Project  ",
        description: "   ",
        priority: "low",
      })
    ).toEqual({
      projectId: "proj-1",
      name: "Updated Project",
      status: undefined,
      priority: "low",
      description: null,
    });
  });
});

describe("createProjectCreateToolDefinition", () => {
  it("creates a project and returns structured details", async () => {
    const project = createProjectSummary({ name: "Created Project", priority: "high" });
    const projectService = {
      createProject: vi.fn().mockResolvedValue(project),
    } as unknown as ProjectService;
    const tool = createProjectCreateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", {
      name: "  Created Project  ",
      description: "  Created from tool  ",
      priority: "high",
    });

    expect(projectService.createProject).toHaveBeenCalledWith({
      name: "Created Project",
      description: "Created from tool",
      priority: "high",
    });
    expect(result.content[0]?.text).toContain(`Created project ${project.id}: ${project.name}`);
    expect(result.details).toEqual({
      kind: "project_create",
      input: {
        name: "Created Project",
        description: "Created from tool",
        priority: "high",
      },
      project,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createProjectCreateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { name: "   " })).rejects.toThrow(
      "project_create failed: name is required"
    );
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createProjectCreateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        createProject: vi.fn().mockRejectedValue(new Error("duplicate project name")),
      } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { name: "Created Project" })).rejects.toThrow(
      "project_create failed: duplicate project name"
    );
  });
});

describe("createProjectUpdateToolDefinition", () => {
  it("supports incremental authorized-actor updates", async () => {
    const projectService = {
      getProject: vi
        .fn()
        .mockResolvedValue(createProjectSummary({ authorizedAssigneeActorIds: ["actor-user"] })),
      updateProject: vi
        .fn()
        .mockResolvedValue(
          createProjectSummary({ authorizedAssigneeActorIds: ["actor-user", "actor-reviewer"] })
        ),
    } as unknown as ProjectService;
    const actorService = {
      listActors: vi.fn().mockResolvedValue([
        { id: "actor-user", displayName: "Erik", archived: false },
        { id: "actor-reviewer", displayName: "Reviewer", archived: false },
      ]),
    } as unknown as ActorService;
    const tool = createProjectUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    await tool.execute("tool-call-1", {
      projectId: "proj-1",
      addAuthorizedAssigneeActorIds: ["actor-reviewer"],
    });

    expect(projectService.updateProject).toHaveBeenCalledWith({
      projectId: "proj-1",
      status: undefined,
      priority: undefined,
      authorizedAssigneeActorIds: ["actor-user", "actor-reviewer"],
    });
  });

  it("fails when authorizing an unknown actor", async () => {
    const projectService = {
      updateProject: vi.fn(),
    } as unknown as ProjectService;
    const actorService = {
      listActors: vi
        .fn()
        .mockResolvedValue([{ id: "actor-user", displayName: "Erik", archived: false }]),
    } as unknown as ActorService;
    const tool = createProjectUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
      getActorService: vi.fn().mockResolvedValue(actorService),
    });

    await expect(
      tool.execute("tool-call-1", {
        projectId: "proj-1",
        authorizedAssigneeActorIds: ["actor-missing"],
      })
    ).rejects.toThrow("project_update failed: actor not found: actor-missing");
  });
  it("updates supported fields and returns structured details", async () => {
    const project = createProjectSummary({
      name: "Updated Project",
      status: "done",
      priority: "high",
      description: null,
    });
    const projectService = {
      updateProject: vi.fn().mockResolvedValue(project),
    } as unknown as ProjectService;
    const tool = createProjectUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", {
      projectId: " proj-1 ",
      name: "  Updated Project  ",
      status: "done",
      priority: "high",
      description: "   ",
    });

    expect(projectService.updateProject).toHaveBeenCalledWith({
      projectId: "proj-1",
      name: "Updated Project",
      status: "done",
      priority: "high",
      description: null,
    });
    expect(result.content[0]?.text).toContain(`Updated project ${project.id}: ${project.name}`);
    expect(result.content[0]?.text).toContain(
      'Changes: name="Updated Project", status=done, priority=high, description=cleared'
    );
    expect(result.details).toEqual({
      kind: "project_update",
      input: {
        projectId: "proj-1",
        name: "Updated Project",
        status: "done",
        priority: "high",
        description: null,
      },
      project,
    });
  });

  it("fails fast when no supported fields are provided", async () => {
    const tool = createProjectUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({} as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { projectId: "proj-1" })).rejects.toThrow(
      "project_update failed: project_update requires at least one supported field: name, description, status, priority, or authorizedAssigneeActorIds"
    );
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createProjectUpdateToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        updateProject: vi.fn().mockRejectedValue(new Error("project not found")),
      } as unknown as ProjectService),
    });

    await expect(
      tool.execute("tool-call-1", { projectId: "proj-1", priority: "low" })
    ).rejects.toThrow("project_update failed: project not found");
  });
});

describe("createProjectDeleteToolDefinition", () => {
  it("deletes a project and returns structured details", async () => {
    const projectService = {
      deleteProject: vi.fn().mockResolvedValue({ projectId: "proj-1", deleted: true }),
    } as unknown as ProjectService;
    const tool = createProjectDeleteToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", { projectId: " proj-1 " });

    expect(projectService.deleteProject).toHaveBeenCalledWith("proj-1");
    expect(result.content[0]?.text).toBe("Deleted project proj-1.");
    expect(result.details).toEqual({
      kind: "project_delete",
      projectId: "proj-1",
      found: true,
      deleted: true,
      project: { projectId: "proj-1", deleted: true },
    });
  });

  it("returns an explicit not-found result when the project is missing", async () => {
    const tool = createProjectDeleteToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        deleteProject: vi.fn().mockRejectedValue(
          new ToduProjectServiceError({
            operation: "deleteProject",
            causeCode: "not-found",
            message: "deleteProject failed: project.delete failed (NOT_FOUND): project not found",
          })
        ),
      } as unknown as ProjectService),
    });

    const result = await tool.execute("tool-call-1", { projectId: "proj-missing" });

    expect(result.content[0]?.text).toBe("Project not found: proj-missing");
    expect(result.details).toEqual({
      kind: "project_delete",
      projectId: "proj-missing",
      found: false,
      deleted: false,
    });
  });

  it("surfaces backend failures with tool-specific context", async () => {
    const tool = createProjectDeleteToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        deleteProject: vi.fn().mockRejectedValue(new Error("backend refusal")),
      } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { projectId: "proj-1" })).rejects.toThrow(
      "project_delete failed: backend refusal"
    );
  });
});
