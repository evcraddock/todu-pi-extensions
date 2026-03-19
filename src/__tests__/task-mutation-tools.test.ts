import { describe, expect, it, vi } from "vitest";

import type { TaskComment, TaskDetail } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { TaskService } from "@/services/task-service";
import {
  createTaskCommentCreateToolDefinition,
  createTaskCreateToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeTaskCommentInput,
  normalizeUpdateTaskInput,
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
      "task_update requires at least one supported field: status, priority, or description"
    );
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

describe("createTaskCreateToolDefinition", () => {
  it("creates a task and returns structured details", async () => {
    const task = createTaskDetail();
    const taskService = {
      createTask: vi.fn().mockResolvedValue(task),
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

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskCreateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
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
    const task = createTaskDetail({ status: "inprogress", priority: "medium", description: null });
    const taskService = {
      updateTask: vi.fn().mockResolvedValue(task),
    } as unknown as TaskService;
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      taskId: " task-123 ",
      status: "inprogress",
      priority: "medium",
      description: "   ",
    });

    expect(taskService.updateTask).toHaveBeenCalledWith({
      taskId: "task-123",
      status: "inprogress",
      priority: "medium",
      description: null,
    });
    expect(result.content[0]?.text).toContain(`Updated task ${task.id}: ${task.title}`);
    expect(result.content[0]?.text).toContain(
      "Changes: status=inprogress, priority=medium, description=cleared"
    );
    expect(result.details).toEqual({
      kind: "task_update",
      input: {
        taskId: "task-123",
        status: "inprogress",
        priority: "medium",
        description: null,
      },
      task,
    });
  });

  it("fails fast when no supported fields are provided", async () => {
    const tool = createTaskUpdateToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    await expect(tool.execute("tool-call-1", { taskId: "task-123" })).rejects.toThrow(
      "task_update requires at least one supported field: status, priority, or description"
    );
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
