import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskSummary } from "@/domain/task";
import { registerTools } from "@/extension/register-tools";
import type { TaskService } from "@/services/task-service";
import {
  createTaskListToolDefinition,
  createTaskShowToolDefinition,
  normalizeTaskListFilter,
} from "@/tools/task-read-tools";

const createTaskSummary = (overrides: Partial<TaskSummary> = {}): TaskSummary => ({
  id: "task-123",
  title: "Implement task tools",
  status: "active",
  priority: "high",
  projectId: "proj-1",
  projectName: "Todu Pi Extensions",
  labels: ["tools"],
  ...overrides,
});

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  ...createTaskSummary(),
  description: "Add the first read-only task tools.",
  comments: [
    {
      id: "comment-1",
      taskId: "task-123",
      author: "user",
      createdAt: "2026-03-19T00:00:00.000Z",
      content: "Looks good",
    },
  ],
  ...overrides,
});

describe("registerTools", () => {
  it("registers the V1 task read tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    registerTools(pi as never, {
      getTaskService: vi.fn().mockResolvedValue({} as TaskService),
    });

    const registeredToolNames = pi.registerTool.mock.calls.map(([tool]) => tool.name);
    expect(registeredToolNames).toEqual(expect.arrayContaining(["task_list", "task_show"]));
  });
});

describe("normalizeTaskListFilter", () => {
  it("normalizes blank optional values out of the filter", () => {
    expect(
      normalizeTaskListFilter({
        statuses: [],
        priorities: [],
        projectId: "   ",
        query: "   ",
      })
    ).toEqual({
      statuses: undefined,
      priorities: undefined,
      projectId: undefined,
      query: undefined,
      from: undefined,
      to: undefined,
      label: undefined,
      overdue: undefined,
      today: undefined,
      sort: undefined,
      sortDirection: undefined,
    });
  });

  it("preserves new filter fields when provided", () => {
    expect(
      normalizeTaskListFilter({
        from: "2026-01-01",
        to: "2026-03-31",
        label: "tools",
        overdue: true,
        today: false,
        sort: "createdAt",
        sortDirection: "asc",
      })
    ).toEqual({
      statuses: undefined,
      priorities: undefined,
      projectId: undefined,
      query: undefined,
      from: "2026-01-01",
      to: "2026-03-31",
      label: "tools",
      overdue: true,
      today: false,
      sort: "createdAt",
      sortDirection: "asc",
    });
  });
});

describe("createTaskListToolDefinition", () => {
  it("lists tasks with the normalized filter and returns structured details", async () => {
    const tasks = [createTaskSummary()];
    const taskService = {
      listTasks: vi.fn().mockResolvedValue(tasks),
    } as unknown as TaskService;
    const tool = createTaskListToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {
      statuses: ["active"],
      priorities: ["high"],
      projectId: "proj-1",
      query: "task tools",
    });

    expect(taskService.listTasks).toHaveBeenCalledWith({
      statuses: ["active"],
      priorities: ["high"],
      projectId: "proj-1",
      query: "task tools",
      from: undefined,
      to: undefined,
      label: undefined,
      overdue: undefined,
      today: undefined,
      sort: undefined,
      sortDirection: undefined,
    });
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Tasks (1):");
    expect(result.content[0]?.text).toContain("task-123");
    expect(result.details).toEqual({
      kind: "task_list",
      filter: {
        statuses: ["active"],
        priorities: ["high"],
        projectId: "proj-1",
        query: "task tools",
        from: undefined,
        to: undefined,
        label: undefined,
        overdue: undefined,
        today: undefined,
        sort: undefined,
        sortDirection: undefined,
      },
      tasks,
      total: 1,
      empty: false,
    });
  });

  it("returns a non-error empty result when no tasks match", async () => {
    const taskService = {
      listTasks: vi.fn().mockResolvedValue([]),
    } as unknown as TaskService;
    const tool = createTaskListToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", {});

    expect(result.content[0]?.text).toBe("No tasks found.");
    expect(result.details).toEqual({
      kind: "task_list",
      filter: {
        statuses: undefined,
        priorities: undefined,
        projectId: undefined,
        query: undefined,
        from: undefined,
        to: undefined,
        label: undefined,
        overdue: undefined,
        today: undefined,
        sort: undefined,
        sortDirection: undefined,
      },
      tasks: [],
      total: 0,
      empty: true,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskListToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        listTasks: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(tool.execute("tool-call-1", {})).rejects.toThrow(
      "task_list failed: daemon unavailable"
    );
  });
});

describe("createTaskShowToolDefinition", () => {
  it("returns task detail with a structured found result", async () => {
    const task = createTaskDetail();
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
    } as unknown as TaskService;
    const tool = createTaskShowToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", { taskId: task.id });

    expect(taskService.getTask).toHaveBeenCalledWith(task.id);
    expect(result.content[0]?.text).toContain(`Task ${task.id}: ${task.title}`);
    expect(result.content[0]?.text).toContain("Description:");
    expect(result.content[0]?.text).toContain("Recent comments (1):");
    expect(result.details).toEqual({
      kind: "task_show",
      taskId: task.id,
      found: true,
      task,
    });
  });

  it("returns a non-error not-found result when the task is missing", async () => {
    const taskService = {
      getTask: vi.fn().mockResolvedValue(null),
    } as unknown as TaskService;
    const tool = createTaskShowToolDefinition({
      getTaskService: vi.fn().mockResolvedValue(taskService),
    });

    const result = await tool.execute("tool-call-1", { taskId: "task-missing" });

    expect(result.content[0]?.text).toBe("Task not found: task-missing");
    expect(result.details).toEqual({
      kind: "task_show",
      taskId: "task-missing",
      found: false,
    });
  });

  it("surfaces service failures with tool-specific context", async () => {
    const tool = createTaskShowToolDefinition({
      getTaskService: vi.fn().mockResolvedValue({
        getTask: vi.fn().mockRejectedValue(new Error("daemon unavailable")),
      } as unknown as TaskService),
    });

    await expect(tool.execute("tool-call-1", { taskId: "task-123" })).rejects.toThrow(
      "task_show failed: daemon unavailable"
    );
  });
});
