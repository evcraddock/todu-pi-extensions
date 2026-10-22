import { validateToolArguments } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";

import type { TaskDetail } from "@/domain/task";
import { createTaskNewCommandHandler } from "@/extension/register-commands";
import type { TaskService } from "@/services/task-service";
import { createToduDaemonClient } from "@/services/todu/daemon-client";
import { createToduTaskService } from "@/services/todu/todu-task-service";
import {
  createTaskCreateToolDefinition,
  createTaskUpdateToolDefinition,
  normalizeCreateTaskInput,
  normalizeUpdateTaskInput,
  resolveUpdateTaskInput,
} from "@/tools/task-mutation-tools";
import { normalizeTaskScheduledDate } from "@/utils/task-scheduled-date";

const dates = ["2026-11-01", "2026-11-01T09:30:00-06:00", "2026-11-01T23:45:12.345Z"];
const project = {
  id: "proj-1",
  name: "Scheduled tasks",
  status: "active" as const,
  priority: "medium" as const,
  description: null,
  authorizedAssigneeActorIds: [],
};
const task: TaskDetail = {
  id: "task-1",
  title: "Schedule this task",
  projectId: project.id,
  projectName: project.name,
  status: "active",
  priority: "medium",
  labels: ["existing"],
  assigneeActorIds: [],
  assigneeDisplayNames: [],
  assignees: [],
  description: null,
  descriptionApproval: null,
  comments: [],
  outboundAssigneeWarnings: [],
  dueDate: null,
  scheduledDate: "2026-10-30",
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
};

const createRuntime = () => {
  const request = vi.fn(async (method: string, params?: { input?: Record<string, unknown> }) => {
    const input = Object.fromEntries(
      Object.entries(params?.input ?? {}).filter(([, value]) => value !== undefined)
    );
    switch (method) {
      case "task.create":
        return { ok: true, value: { ...task, scheduledDate: undefined, ...input } };
      case "task.update":
        return { ok: true, value: { ...task, ...input } };
      case "project.get":
        return { ok: true, value: project };
      case "actor.list":
      case "note.list":
        return { ok: true, value: [] };
      default:
        throw new Error(`Unexpected RPC: ${method}`);
    }
  });
  const client = createToduDaemonClient({
    connection: { request, subscribeToEvents: vi.fn() } as never,
  });
  const taskService = createToduTaskService({ client });
  return { request, taskService };
};

const validateParams = <T extends { name: string; parameters: object }>(
  tool: T,
  args: Record<string, unknown>
) =>
  validateToolArguments(tool as never, {
    type: "toolCall",
    id: "call-1",
    name: tool.name,
    arguments: args as Parameters<typeof validateToolArguments>[1]["arguments"],
  });

describe("scheduled-date mutation input", () => {
  it.each(dates)("preserves %s without timezone conversion", (date) => {
    expect(normalizeTaskScheduledDate(`  ${date}  `)).toBe(date);
    expect(
      normalizeCreateTaskInput({ title: task.title, projectId: project.id, scheduledDate: date })
    ).toMatchObject({ scheduledDate: date });
    expect(normalizeUpdateTaskInput({ taskId: task.id, scheduledDate: date })).toMatchObject({
      taskId: task.id,
      scheduledDate: date,
    });
  });

  it.each(["", "   ", "not-a-date", "2026-99-99"])("rejects invalid date %j", (date) => {
    expect(() =>
      normalizeCreateTaskInput({ title: task.title, projectId: project.id, scheduledDate: date })
    ).toThrow("scheduledDate");
    expect(() => normalizeUpdateTaskInput({ taskId: task.id, scheduledDate: date })).toThrow(
      "scheduledDate"
    );
  });

  it("does not add scheduledDate when omitted or undefined", () => {
    expect(
      normalizeCreateTaskInput({ title: task.title, projectId: project.id })
    ).not.toHaveProperty("scheduledDate");
    expect(
      normalizeUpdateTaskInput({ taskId: task.id, title: "Renamed", scheduledDate: undefined })
    ).not.toHaveProperty("scheduledDate");
  });

  it.each([
    { labels: ["new"], removeLabels: ["existing"] },
    { addAssigneeActorIds: ["actor-new"] },
    { assigneeActorIds: ["actor-new"] },
  ])("preserves a scheduled date with label/assignee mutations: %j", async (otherFields) => {
    const taskService = { getTask: vi.fn().mockResolvedValue(task) } as unknown as TaskService;
    const input = await resolveUpdateTaskInput(taskService, {
      taskId: task.id,
      scheduledDate: dates[0],
      ...otherFields,
    });
    expect(input.scheduledDate).toBe(dates[0]);
    if ("labels" in otherFields) expect(input.labels).toEqual(["new"]);
    else expect(input.assigneeActorIds).toEqual(["actor-new"]);
  });
});

describe.each(["create", "update"] as const)("task_%s scheduled dates", (operation) => {
  it.each(dates)("passes %s through schema, tool, flow, service, and RPC", async (date) => {
    const { request, taskService } = createRuntime();
    const dependencies = { getTaskService: vi.fn().mockResolvedValue(taskService) };
    const tool =
      operation === "create"
        ? createTaskCreateToolDefinition(dependencies)
        : createTaskUpdateToolDefinition(dependencies);
    const args =
      operation === "create"
        ? { title: task.title, projectId: project.id, scheduledDate: date }
        : { taskId: task.id, scheduledDate: date };
    const params = validateParams(tool, args);
    const result = await tool.execute("call-1", params as never);

    expect(request).toHaveBeenCalledWith(
      `task.${operation}`,
      expect.objectContaining({
        ...(operation === "update" ? { id: task.id } : {}),
        input: expect.objectContaining({ scheduledDate: date }),
      })
    );
    expect(result.details).toMatchObject({
      input: { scheduledDate: date },
      task: { scheduledDate: date },
    });
    expect(result.content[0]?.text).toContain(
      operation === "create" ? `Scheduled: ${date}` : `scheduledDate=${date}`
    );
  });

  it("omits the date from the RPC when not provided", async () => {
    const { request, taskService } = createRuntime();
    if (operation === "create")
      await taskService.createTask({ title: task.title, projectId: project.id });
    else await taskService.updateTask({ taskId: task.id, title: "Renamed" });
    const call = request.mock.calls.find(([method]) => method === `task.${operation}`);
    expect(call).toBeDefined();
    expect(call?.[1]?.input).not.toHaveProperty("scheduledDate");
  });

  it.each([{}, []])("rejects non-string %j at schema validation", (date) => {
    const deps = { getTaskService: vi.fn() };
    const tool =
      operation === "create"
        ? createTaskCreateToolDefinition(deps)
        : createTaskUpdateToolDefinition(deps);
    expect(() =>
      validateParams(tool, {
        ...(operation === "create"
          ? { title: task.title, projectId: project.id }
          : { taskId: task.id }),
        scheduledDate: date,
      })
    ).toThrow("Validation failed for tool");
  });

  it.each([null, 123])(
    "rejects non-string %j if execution bypasses schema validation",
    async (date) => {
      const { request, taskService } = createRuntime();
      const deps = { getTaskService: vi.fn().mockResolvedValue(taskService) };
      const tool =
        operation === "create"
          ? createTaskCreateToolDefinition(deps)
          : createTaskUpdateToolDefinition(deps);
      await expect(
        tool.execute("call-1", {
          ...(operation === "create"
            ? { title: task.title, projectId: project.id }
            : { taskId: task.id }),
          scheduledDate: date,
        } as never)
      ).rejects.toThrow(`task_${operation} failed: scheduledDate`);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("fails with tool context before any RPC for an invalid date", async () => {
    const { request, taskService } = createRuntime();
    const deps = { getTaskService: vi.fn().mockResolvedValue(taskService) };
    const tool =
      operation === "create"
        ? createTaskCreateToolDefinition(deps)
        : createTaskUpdateToolDefinition(deps);
    await expect(
      tool.execute("call-1", {
        ...(operation === "create"
          ? { title: task.title, projectId: project.id }
          : { taskId: task.id }),
        scheduledDate: "bad date",
      } as never)
    ).rejects.toThrow(`task_${operation} failed: scheduledDate`);
    expect(request).not.toHaveBeenCalled();
  });
});

const createNewTaskHarness = () => {
  const { request, taskService } = createRuntime();
  const context = {
    hasUI: true,
    ui: { input: vi.fn(), notify: vi.fn() },
  };
  const openTaskDetail = vi.fn().mockResolvedValue(undefined);
  const dependencies = {
    getTaskService: vi.fn().mockResolvedValue(taskService),
    promptTaskTitle: vi.fn().mockResolvedValue(task.title),
    selectTaskProject: vi.fn().mockResolvedValue({ status: "selected", project }),
    editTaskExplanation: vi.fn().mockResolvedValue("Draft"),
    confirmTaskAuthoring: vi.fn().mockResolvedValue(false),
    openTaskDetail,
  };
  return { request, taskService, context, openTaskDetail, dependencies };
};

describe("/task-new scheduled dates", () => {
  it.each(dates)("creates a scheduled task for %s and opens its detail", async (date) => {
    const { request, context, openTaskDetail, dependencies, taskService } = createNewTaskHarness();
    context.ui.input.mockResolvedValue(date);
    await createTaskNewCommandHandler(dependencies)("", context as never);
    expect(context.ui.input).toHaveBeenCalledWith("Scheduled date (optional)", expect.any(String));
    expect(request).toHaveBeenCalledWith("task.create", {
      input: expect.objectContaining({ scheduledDate: date, description: "Draft" }),
    });
    expect(openTaskDetail).toHaveBeenCalledWith(context, taskService, task.id);
  });

  it.each(["", "   "])("leaves a blank date %j unscheduled", async (date) => {
    const { request, context, dependencies } = createNewTaskHarness();
    context.ui.input.mockResolvedValue(date);
    await createTaskNewCommandHandler(dependencies)("", context as never);
    const call = request.mock.calls.find(([method]) => method === "task.create");
    expect(call).toBeDefined();
    expect(call?.[1]?.input).not.toHaveProperty("scheduledDate");
  });

  it("re-prompts after invalid dates without discarding the task draft", async () => {
    const { request, context, dependencies } = createNewTaskHarness();
    context.ui.input.mockResolvedValueOnce("not-a-date").mockResolvedValueOnce(dates[0]);
    await createTaskNewCommandHandler(dependencies)("", context as never);
    expect(context.ui.input).toHaveBeenCalledTimes(2);
    expect(context.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid scheduled date"),
      "warning"
    );
    expect(request).toHaveBeenCalledWith("task.create", {
      input: expect.objectContaining({
        title: task.title,
        description: "Draft",
        scheduledDate: dates[0],
      }),
    });
  });

  it("cancels without task creation when Escape dismisses the date prompt", async () => {
    const { request, context, dependencies, openTaskDetail } = createNewTaskHarness();
    context.ui.input.mockResolvedValue(undefined);
    await createTaskNewCommandHandler(dependencies)("", context as never);
    expect(request).not.toHaveBeenCalled();
    expect(openTaskDetail).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith("Task creation cancelled", "info");
  });

  it("reports date prompt failures without creating a task", async () => {
    const { request, context, dependencies } = createNewTaskHarness();
    context.ui.input.mockRejectedValue(new Error("UI unavailable"));
    await createTaskNewCommandHandler(dependencies)("", context as never);
    expect(request).not.toHaveBeenCalled();
    expect(context.ui.notify).toHaveBeenCalledWith(
      "Failed to collect scheduled date: UI unavailable",
      "error"
    );
  });

  it("retains a scheduled date with task-authoring assistance", async () => {
    const { request, context, dependencies } = createNewTaskHarness();
    context.ui.input.mockResolvedValue(dates[0]);
    dependencies.confirmTaskAuthoring.mockResolvedValue(true);
    await createTaskNewCommandHandler({
      ...dependencies,
      requestTaskAuthoringAssistance: vi
        .fn()
        .mockResolvedValue({ title: "Authored title", description: "Authored description" }),
    })("", context as never);
    expect(request).toHaveBeenCalledWith("task.create", {
      input: expect.objectContaining({
        title: "Authored title",
        description: "Authored description",
        scheduledDate: dates[0],
      }),
    });
  });
});
