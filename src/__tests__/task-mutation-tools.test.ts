import { describe, expect, it, vi } from "vitest";

import type { ProjectSummary, TaskComment, TaskDetail } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { TaskService } from "@/services/task-service";
import {
  createTaskCommentCreateToolDefinition,
  createTaskCreateToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeTaskCommentInput,
  normalizeUpdateTaskInput,
  resolveCreateTaskInput,
  resolveProjectForTaskCreate,
} from "@/tools/task-mutation-tools";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  id: "task-123",
  title: "Implement mutation tools",
  status: "active",
  priority: "high",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: [],
  description: "Add create, update, and comment tools.",
  comments: [],
  ...overrides,
});

const createTaskComment = (overrides: Partial<TaskComment> = {}): TaskComment => ({
  id: "comment-1",
  taskId: "task-123",
  author: "user",
  createdAt: "2026-03-19T00:00:00.000Z",
  content: "Looks good",
  ...overrides,
});

const createProjectSummary = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "proj-1",
  name: "Todu Pi Extensions",
  status: "active",
  priority: "medium",
  description: "Primary project",
  ...overrides,
});

describe("registerTools", () => {
  it("registers the V1 task mutation tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining(["task_create", "task_update", "task_comment_create"])
    );
  });
});

describe("normalizeCreateTaskInput", () => {
  it("trims required text fields and normalizes blank descriptions to null", () => {
    expect(
      normalizeCreateTaskInput({
        title: "  Implement mutation tools  ",
        projectId: "  proj-1  ",
        description: "   ",
      })
    ).toEqual({
      title: "Implement mutation tools",
      projectId: "proj-1",
      description: null,
    });
  });

  it("rejects blank titles", () => {
    expect(() =>
      normalizeCreateTaskInput({
        title: "   ",
        projectId: "proj-1",
      })
    ).toThrow("title is required");
  });
});

describe("normalizeUpdateTaskInput", () => {
  it("requires at least one supported mutation field", () => {
    expect(() => normalizeUpdateTaskInput({ taskId: "task-123" })).toThrow(
      "task_update requires at least one supported field: title, status, priority, or description"
    );
  });

  it("trims replacement titles", () => {
    expect(
      normalizeUpdateTaskInput({
        taskId: " task-123 ",
        title: "  Updated title  ",
      })
    ).toEqual({
      taskId: "task-123",
      title: "Updated title",
      status: undefined,
      priority: undefined,
    });
  });

  it("treats blank descriptions as an explicit clear", () => {
    expect(
      normalizeUpdateTaskInput({
        taskId: " task-123 ",
        description: "   ",
      })
    ).toEqual({
      taskId: "task-123",
      status: undefined,
      priority: undefined,
      description: null,
    });
  });
});

describe("normalizeTaskCommentInput", () => {
  it("trims comment content and rejects blank input", () => {
    expect(
      normalizeTaskCommentInput({
        taskId: " task-123 ",
        content: "  Added a note  ",
      })
    ).toEqual({
      taskId: "task-123",
      content: "Added a note",
    });

    expect(() =>
      normalizeTaskCommentInput({
        taskId: "task-123",
        content: "   ",
      })
    ).toThrow("content is required");
  });
});

describe("resolveProjectForTaskCreate", () => {
  it("returns a direct project match by ID first", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(project),
      listProjects: vi.fn(),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, project.id)).resolves.toEqual(project);
    expect(taskService.getProject).toHaveBeenCalledWith(project.id);
    expect(taskService.listProjects).not.toHaveBeenCalled();
  });

  it("falls back to a unique project-name match", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, project.name)).resolves.toEqual(project);
    expect(taskService.getProject).toHaveBeenCalledWith(project.name);
    expect(taskService.listProjects).toHaveBeenCalledWith();
  });

  it("fails clearly when the project name does not match anything", async () => {
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as TaskService;

    await expect(resolveProjectForTaskCreate(taskService, "missing-project")).rejects.toThrow(
      "project not found: missing-project"
    );
  });

  it("fails clearly when the project-name match is ambiguous", async () => {
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi
        .fn()
        .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
    } as unknown as TaskService;

    await expect(
      resolveProjectForTaskCreate(taskService, "Todu Pi Extensions")
    ).rejects.toThrow("multiple projects matched: Todu Pi Extensions");
  });
});

describe("resolveCreateTaskInput", () => {
  it("replaces a unique project name with the resolved project ID", async () => {
    const project = createProjectSummary();
    const taskService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;

    await expect(
      resolveCreateTaskInput(taskService, {
        title: "Implement mutation tools",
        projectId: project.name,
        description: "Add create, update, and comment tools.",
      })
    ).resolves.toEqual({
      title: "Implement mutation tools",
      projectId: project.id,
      description: "Add create, update, and comment tools.",
    });
  });
});

describe("createTaskCreateToolDefinition", () => {
  it("creates a task and returns structured details", async () => {
    const task = createTaskDetail();
    const taskService = {
      createTask: vi.fn().mockResolvedValue(task),
      getProject: vi.fn().mockResolvedValue(createProjectSummary()),
      listProjects: vi.fn(),
    } as unknown as TaskService;
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      title: "  Implement mutation tools  ",
      projectId: " proj-1 ",
      description: "  Add create, update, and comment tools.  ",
    });

    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement mutation tools",
      projectId: "proj-1",
      description: "Add create, update, and comment tools.",
    });
    expect(result.content[0]?.text).toContain(`Created task ${task.id}: ${task.title}`);
    expect(result.details).toEqual({
      kind: "task_create",
      input: {
        title: "Implement mutation tools",
        projectId: "proj-1",
        description: "Add create, update, and comment tools.",
      },
      task,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "   ",
        projectId: "proj-1",
      })
    ).rejects.toThrow("task_create failed: title is required");
  });

  it("resolves a unique project name before creating the task", async () => {
    const project = createProjectSummary();
    const task = createTaskDetail({ projectId: project.id, projectName: project.name });
    const taskService = {
      createTask: vi.fn().mockResolvedValue(task),
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([project]),
    } as unknown as TaskService;
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    await tool.execute("tool-call-1", {
      title: "Implement mutation tools",
      projectId: project.name,
    });

    expect(taskService.createTask).toHaveBeenCalledWith({
      title: "Implement mutation tools",
      projectId: project.id,
      description: undefined,
    });
  });

  it("fails clearly when the project name is missing", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(null),
        listProjects: vi.fn().mockResolvedValue([]),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "missing-project",
      })
    ).rejects.toThrow("task_create failed: project not found: missing-project");
  });

  it("fails clearly when the project name is ambiguous", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(null),
        listProjects: vi
          .fn()
          .mockResolvedValue([createProjectSummary(), createProjectSummary({ id: "proj-2" })]),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "Todu Pi Extensions",
      })
    ).rejects.toThrow("task_create failed: multiple projects matched: Todu Pi Extensions");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getProject: vi.fn().mockResolvedValue(createProjectSummary()),
        createTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        title: "Implement mutation tools",
        projectId: "proj-1",
      })
    ).rejects.toThrow("task_create failed: daemon unavailable");
  });
});

describe("createTaskUpdateToolDefinition", () => {
  it("updates supported fields and returns structured details", async () => {
    const task = createTaskDetail({
      title: "Updated task title",
      status: "inprogress",
      priority: "medium",
      description: null,
    });
    const taskService = {
      updateTask: vi.fn().mockResolvedValue(task),
    } as unknown as TaskService;
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      taskId: " task-123 ",
      title: "  Updated task title  ",
      status: "inprogress",
      priority: "medium",
      description: "   ",
    });

    expect(taskService.updateTask).toHaveBeenCalledWith({
      taskId: "task-123",
      title: "Updated task title",
      status: "inprogress",
      priority: "medium",
      description: null,
    });
    expect(result.content[0]?.text).toContain(`Updated task ${task.id}: ${task.title}`);
    expect(result.content[0]?.text).toContain(
      'Changes: title="Updated task title", status=inprogress, priority=medium, description=cleared'
    );
    expect(result.details).toEqual({
      kind: "task_update",
      input: {
        taskId: "task-123",
        title: "Updated task title",
        status: "inprogress",
        priority: "medium",
        description: null,
      },
      task,
    });
  });

  it("fails fast with contextual output when no supported fields are provided", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(tool.execute("tool-call-1", { taskId: "task-123" })).rejects.toThrow(
      "task_update failed: task_update requires at least one supported field: title, status, priority, or description"
    );
  });

  it("surfaces title validation failures with tool-specific context", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        title: "   ",
      })
    ).rejects.toThrow("task_update failed: title is required");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        updateTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        status: "done",
      })
    ).rejects.toThrow("task_update failed: daemon unavailable");
  });
});

describe("createTaskCommentCreateToolDefinition", () => {
  it("adds a task comment and returns structured details", async () => {
    const comment = createTaskComment();
    const taskService = {
      addTaskComment: vi.fn().mockResolvedValue(comment),
    } as unknown as TaskService;
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      taskId: " task-123 ",
      content: "  Added a note  ",
    });

    expect(taskService.addTaskComment).toHaveBeenCalledWith({
      taskId: "task-123",
      content: "Added a note",
    });
    expect(result.content[0]?.text).toBe("Added comment comment-1 to task task-123.");
    expect(result.details).toEqual({
      kind: "task_comment_create",
      taskId: "task-123",
      comment,
    });
  });

  it("surfaces validation failures with tool-specific context", async () => {
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        content: "   ",
      })
    ).rejects.toThrow("task_comment_create failed: content is required");
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskCommentCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        addTaskComment: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(
      tool.execute("tool-call-1", {
        taskId: "task-123",
        content: "Added a note",
      })
    ).rejects.toThrow("task_comment_create failed: daemon unavailable");
  });
});
