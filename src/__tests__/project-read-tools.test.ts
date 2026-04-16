import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { ProjectService } from "@/services/project-service";
import type { TaskService } from "@/services/task-service";
import {
  createProjectListToolDefinition,
  createProjectShowToolDefinition,
  formatProjectListContent,
  formatProjectShowContent,
  resolveProjectByRef,
} from "@/tools/project-read-tools";

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
  it("registers the complete V1 first-wave tool set", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining([
        "task_list",
        "task_show",
        "task_create",
        "task_update",
        "task_comment_create",
        "project_list",
        "project_show",
        "project_create",
        "project_update",
        "project_delete",
      ])
    );
  });
});

describe("formatProjectListContent", () => {
  it("formats concise project summary lines", () => {
    expect(
      formatProjectListContent({
        kind: "project_list",
        projects: [createProjectSummary()],
        total: 1,
        empty: false,
      })
    ).toContain("proj-1 • Todu Pi Extensions • active • medium");
  });
});

describe("formatProjectShowContent", () => {
  it("formats concise project detail output", () => {
    expect(formatProjectShowContent(createProjectSummary())).toContain(
      "Project proj-1: Todu Pi Extensions"
    );
  });

  it("shows authorized actors and stale unauthorized assignees", () => {
    const content = formatProjectShowContent(
      createProjectSummary({ authorizedAssigneeActorIds: ["actor-user"] }),
      [{ id: "actor-user", displayName: "Erik", archived: false }],
      [
        {
          id: "task-1",
          title: "Follow up",
          status: "active",
          priority: "medium",
          projectId: "proj-1",
          projectName: "Todu Pi Extensions",
          labels: [],
          assigneeActorIds: ["actor-user", "actor-reviewer"],
          assigneeDisplayNames: ["Erik", "Reviewer (unauthorized)"],
          assignees: ["Erik", "Reviewer"],
        },
      ]
    );

    expect(content).toContain("Authorized assignees: Erik");
    expect(content).toContain("Stale unauthorized assignees:");
    expect(content).toContain("task-1 • Follow up • Erik, Reviewer (unauthorized)");
  });
});

describe("resolveProjectByRef", () => {
  it("returns a direct project match by ID first", async () => {
    const project = createProjectSummary();
    const projectService = {
      getProject: vi.fn().mockResolvedValue(project),
      listProjects: vi.fn(),
    } as unknown as ProjectService;

    await expect(resolveProjectByRef(projectService, project.id)).resolves.toEqual(project);
    expect(projectService.getProject).toHaveBeenCalledWith(project.id);
    expect(projectService.listProjects).not.toHaveBeenCalled();
  });

  it("falls back to a unique project-name match", async () => {
    const project = createProjectSummary();
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as ProjectService;

    await expect(resolveProjectByRef(projectService, project.name)).resolves.toEqual(project);
    expect(projectService.getProject).toHaveBeenCalledWith(project.name);
    expect(projectService.listProjects).toHaveBeenCalledWith();
  });

  it("returns null when no project matches the ref", async () => {
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as ProjectService;

    await expect(resolveProjectByRef(projectService, "missing-project")).resolves.toBeNull();
  });

  it("fails clearly when name matching is ambiguous", async () => {
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi
        .fn()
        .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
    } as unknown as ProjectService;

    await expect(resolveProjectByRef(projectService, "Todu Pi Extensions")).rejects.toThrow(
      "project_show found multiple projects named: Todu Pi Extensions"
    );
  });
});

describe("createProjectListToolDefinition", () => {
  it("lists projects and returns structured details", async () => {
    const projects = [createProjectSummary()];
    const projectService = {
      listProjects: vi.fn().mockResolvedValue(projects),
    } as unknown as ProjectService;
    const tool = createProjectListToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(projectService.listProjects).toHaveBeenCalledWith();
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Projects (1):");
    expect(result.content[0]?.text).toContain("proj-1");
    expect(result.details).toEqual({
      kind: "project_list",
      projects,
      total: 1,
      empty: false,
    });
  });

  it("returns a non-error empty result when no projects exist", async () => {
    const projectService = {
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as ProjectService;
    const tool = createProjectListToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toBe("No projects found.");
    expect(result.details).toEqual({
      kind: "project_list",
      projects: [],
      total: 0,
      empty: true,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createProjectListToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        listProjects: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "project_list failed: daemon unavailable"
    );
  });
});

describe("createProjectShowToolDefinition", () => {
  it("returns project detail with a structured found result for ID lookups", async () => {
    const project = createProjectSummary();
    const projectService = {
      getProject: vi.fn().mockResolvedValue(project),
      listProjects: vi.fn(),
    } as unknown as ProjectService;
    const tool = createProjectShowToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", { projectRef: project.id });

    expect(projectService.getProject).toHaveBeenCalledWith(project.id);
    expect(projectService.listProjects).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain(`Project ${project.id}: ${project.name}`);
    expect(result.details).toEqual({
      kind: "project_show",
      projectRef: project.id,
      found: true,
      project,
    });
  });

  it("returns project detail with a structured found result for unique name lookups", async () => {
    const project = createProjectSummary();
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as ProjectService;
    const tool = createProjectShowToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", { projectRef: project.name });

    expect(projectService.getProject).toHaveBeenCalledWith(project.name);
    expect(projectService.listProjects).toHaveBeenCalledWith();
    expect(result.content[0]?.text).toContain(`Project ${project.id}: ${project.name}`);
    expect(result.details).toEqual({
      kind: "project_show",
      projectRef: project.name,
      found: true,
      project,
    });
  });

  it("returns a non-error not-found result when the project is missing", async () => {
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as ProjectService;
    const tool = createProjectShowToolDefinition({
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tool-call-1", { projectRef: "missing-project" });

    expect(result.content[0]?.text).toBe("Project not found: missing-project");
    expect(result.details).toEqual({
      kind: "project_show",
      projectRef: "missing-project",
      found: false,
    });
  });

  it("surfaces ambiguous project-name matches clearly", async () => {
    const tool = createProjectShowToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(null),
        listProjects: vi
          .fn()
          .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
      } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { projectRef: "Todu Pi Extensions" })).rejects.toThrow(
      "project_show failed: project_show found multiple projects named: Todu Pi Extensions"
    );
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createProjectShowToolDefinition({
      getProjectService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as ProjectService),
    });

    await expect(tool.execute("tool-call-1", { projectRef: "proj-1" })).rejects.toThrow(
      "project_show failed: daemon unavailable"
    );
  });
});
