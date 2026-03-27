import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { TaskService } from "@/services/task-service";
import {
  createProjectListToolDefinition,
  formatProjectListContent,
} from "@/tools/project-read-tools";

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
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

describe("createProjectListToolDefinition", () => {
  it("lists projects and returns structured details", async () => {
    const projects = [createProjectSummary()];
    const taskService = {
      listProjects: vi.fn().mockResolvedValue(projects),
    } as unknown as TaskService;
    const tool = createProjectListToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(taskService.listProjects).toHaveBeenCalledWith();
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
    const taskService = {
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as TaskService;
    const tool = createProjectListToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
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
      getTaskService: vi.fn().mockResolvedValue({
        listProjects: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "project_list failed: daemon unavailable"
    );
  });
});
