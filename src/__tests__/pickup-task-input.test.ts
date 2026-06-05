import { describe, expect, it, vi } from "vitest";

import type { TaskDetail } from "@/domain/task";
import {
  createPickupTaskInputHandler,
  resolvePickupTaskInputTaskId,
} from "@/extension/pickup-task-input";
import type { TaskService } from "@/services/task-service";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  id: overrides.id ?? "task-123",
  title: overrides.title ?? "Implement pickup input",
  status: overrides.status ?? "active",
  priority: overrides.priority ?? "high",
  projectId: overrides.projectId ?? "proj-1",
  projectName: overrides.projectName ?? "Todu Pi Extensions",
  labels: overrides.labels ?? ["ui"],
  assigneeActorIds: overrides.assigneeActorIds ?? ["actor-user"],
  assigneeDisplayNames: overrides.assigneeDisplayNames ?? ["Erik"],
  assignees: overrides.assignees ?? ["Erik"],
  description: overrides.description ?? "Select tasks from typed pickup commands",
  descriptionApproval: overrides.descriptionApproval ?? null,
  comments: overrides.comments ?? [],
  outboundAssigneeWarnings: overrides.outboundAssigneeWarnings ?? [],
});

const createContext = () => ({
  hasUI: true,
  sessionManager: {
    getBranch: vi.fn().mockReturnValue([]),
  },
  ui: {
    notify: vi.fn(),
    setStatus: vi.fn(),
    setWidget: vi.fn(),
  },
});

describe("resolvePickupTaskInputTaskId", () => {
  it("finds task ids in supported pickup prompts", () => {
    expect(resolvePickupTaskInputTaskId("pick up task-123")).toBe("task-123");
    expect(resolvePickupTaskInputTaskId("pick up task task-123")).toBe("task-123");
    expect(resolvePickupTaskInputTaskId("pickup task-123")).toBe("task-123");
    expect(resolvePickupTaskInputTaskId("pickup task task-123")).toBe("task-123");
  });

  it("does not treat unrelated task references as pickup prompts", () => {
    expect(resolvePickupTaskInputTaskId("show task task-123")).toBeNull();
    expect(resolvePickupTaskInputTaskId("please pick task-123 later")).toBeNull();
  });
});

describe("createPickupTaskInputHandler", () => {
  it("sets the typed pickup task as current and lets the pipeline continue", async () => {
    const task = createTaskDetail({ id: "task-1b1fdc9d" });
    const taskService = {
      getTask: vi.fn().mockResolvedValue(task),
    } as unknown as Pick<TaskService, "getTask">;
    const getTaskService = vi.fn().mockResolvedValue(taskService);
    const setCurrentTask = vi.fn().mockResolvedValue(undefined);
    const context = createContext();
    const handler = createPickupTaskInputHandler({ getTaskService, setCurrentTask });

    const result = await handler(
      { type: "input", text: "pick up task task-1b1fdc9d", source: "interactive" },
      context as never
    );

    expect(result).toEqual({ action: "continue" });
    expect(getTaskService).toHaveBeenCalledTimes(1);
    expect(taskService.getTask).toHaveBeenCalledWith(task.id);
    expect(setCurrentTask).toHaveBeenCalledWith(context, task);
  });

  it("ignores extension-injected and unrelated input", async () => {
    const getTaskService = vi.fn();
    const setCurrentTask = vi.fn();
    const context = createContext();
    const handler = createPickupTaskInputHandler({ getTaskService, setCurrentTask });

    await expect(
      handler(
        { type: "input", text: "pick up task task-123", source: "extension" },
        context as never
      )
    ).resolves.toEqual({ action: "continue" });
    await expect(
      handler(
        { type: "input", text: "show task task-123", source: "interactive" },
        context as never
      )
    ).resolves.toEqual({ action: "continue" });

    expect(getTaskService).not.toHaveBeenCalled();
    expect(setCurrentTask).not.toHaveBeenCalled();
  });

  it("continues without selecting a task when the task cannot be loaded", async () => {
    const taskService = {
      getTask: vi.fn().mockResolvedValue(null),
    } as unknown as Pick<TaskService, "getTask">;
    const setCurrentTask = vi.fn();
    const context = createContext();
    const handler = createPickupTaskInputHandler({
      getTaskService: vi.fn().mockResolvedValue(taskService),
      setCurrentTask,
    });

    const result = await handler(
      { type: "input", text: "pickup task task-missing", source: "interactive" },
      context as never
    );

    expect(result).toEqual({ action: "continue" });
    expect(setCurrentTask).not.toHaveBeenCalled();
  });
});
