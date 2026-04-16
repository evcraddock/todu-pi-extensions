import { describe, expect, it, vi } from "vitest";

import type { TaskDetail } from "@/domain/task";
import {
  createCurrentTaskContextController,
  CURRENT_TASK_STATUS_KEY,
  CURRENT_TASK_WIDGET_KEY,
} from "@/extension/current-task-context";
import { TASK_SESSION_ENTRY_TYPE } from "@/services/task-session-store";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  id: overrides.id ?? "task-123",
  title: overrides.title ?? "Implement current task context",
  status: overrides.status ?? "active",
  priority: overrides.priority ?? "high",
  projectId: overrides.projectId ?? "proj-1",
  projectName: overrides.projectName ?? "Todu Pi Extensions",
  labels: overrides.labels ?? ["ui"],
  assigneeActorIds: overrides.assigneeActorIds ?? ["actor-user"],
  assigneeDisplayNames: overrides.assigneeDisplayNames ?? ["Erik"],
  assignees: overrides.assignees ?? ["Erik"],
  description: overrides.description ?? "Persist and restore current task context",
  descriptionApproval: overrides.descriptionApproval ?? null,
  comments: overrides.comments ?? [],
  outboundAssigneeWarnings: overrides.outboundAssigneeWarnings ?? [],
});

const createContext = (
  branchEntries: Array<{ type: string; customType?: string; data?: unknown }> = []
) => ({
  hasUI: true,
  sessionManager: {
    getBranch: vi.fn().mockReturnValue(branchEntries),
  },
  ui: {
    setStatus: vi.fn(),
    setWidget: vi.fn(),
  },
});

describe("createCurrentTaskContextController", () => {
  it("restores current task state from session entries and updates ambient UI", async () => {
    const task = createTaskDetail();
    const getTask = vi.fn().mockResolvedValue(task);
    const clientOn = vi.fn().mockResolvedValue({ unsubscribe: vi.fn() });
    const runtime = {
      ensureConnected: vi.fn().mockResolvedValue({ getTask }),
      client: {
        on: clientOn,
      },
    };
    const appendEntry = vi.fn();
    const ctx = createContext([
      {
        type: "custom",
        customType: TASK_SESSION_ENTRY_TYPE,
        data: { currentTaskId: task.id },
      },
    ]);

    const controller = createCurrentTaskContextController(
      { appendEntry },
      { runtime: runtime as never }
    );

    await controller.restoreFromBranch(ctx as never);

    expect(runtime.ensureConnected).toHaveBeenCalledTimes(1);
    expect(getTask).toHaveBeenCalledWith(task.id);
    expect(clientOn).toHaveBeenCalledWith("data.changed", expect.any(Function));
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(
      CURRENT_TASK_STATUS_KEY,
      `${task.id} • ${task.title}`
    );
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(CURRENT_TASK_WIDGET_KEY, [
      task.title,
      "active • high • Todu Pi Extensions • assignees: Erik",
    ]);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ currentTaskId: task.id, currentTask: task });
  });

  it("persists current task changes and clears ambient UI when reset", async () => {
    const task = createTaskDetail();
    const clientOn = vi.fn().mockResolvedValue({ unsubscribe: vi.fn() });
    const appendEntry = vi.fn();
    const ctx = createContext();
    const controller = createCurrentTaskContextController(
      { appendEntry },
      {
        runtime: {
          ensureConnected: vi.fn(),
          client: { on: clientOn },
        } as never,
      }
    );

    await controller.setCurrentTask(ctx as never, task);

    expect(appendEntry).toHaveBeenCalledWith(TASK_SESSION_ENTRY_TYPE, {
      currentTaskId: task.id,
    });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(
      CURRENT_TASK_STATUS_KEY,
      `${task.id} • ${task.title}`
    );
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(CURRENT_TASK_WIDGET_KEY, [
      task.title,
      "active • high • Todu Pi Extensions • assignees: Erik",
    ]);

    await controller.clearCurrentTask(ctx as never);

    expect(appendEntry).toHaveBeenLastCalledWith(TASK_SESSION_ENTRY_TYPE, {
      currentTaskId: null,
    });
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(CURRENT_TASK_STATUS_KEY, undefined);
    expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, undefined);
  });

  it("refreshes the focused task after daemon invalidation", async () => {
    const initialTask = createTaskDetail();
    const refreshedTask = createTaskDetail({
      title: "Current task context refreshed",
      priority: "medium",
    });
    const getTask = vi.fn().mockResolvedValue(refreshedTask);
    const ctx = createContext();
    const controller = createCurrentTaskContextController(
      { appendEntry: vi.fn() },
      {
        runtime: {
          ensureConnected: vi.fn().mockResolvedValue({ getTask }),
          client: { on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }) },
        } as never,
      }
    );

    await controller.setCurrentTask(ctx as never, initialTask);
    await controller.handleDataChanged();

    expect(getTask).toHaveBeenCalledWith(initialTask.id);
    expect(controller.getState()).toEqual({
      currentTaskId: initialTask.id,
      currentTask: refreshedTask,
    });
    expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, [
      refreshedTask.title,
      "active • medium • Todu Pi Extensions • assignees: Erik",
    ]);
  });

  it("clears the current task when a focused task becomes done", async () => {
    const initialTask = createTaskDetail();
    const doneTask = createTaskDetail({ status: "done" });
    const getTask = vi.fn().mockResolvedValue(doneTask);
    const appendEntry = vi.fn();
    const ctx = createContext();
    const controller = createCurrentTaskContextController(
      { appendEntry },
      {
        runtime: {
          ensureConnected: vi.fn().mockResolvedValue({ getTask }),
          client: { on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }) },
        } as never,
      }
    );

    await controller.setCurrentTask(ctx as never, initialTask);
    await controller.handleDataChanged();

    expect(getTask).toHaveBeenCalledWith(initialTask.id);
    expect(controller.getState()).toEqual({ currentTaskId: null, currentTask: null });
    expect(appendEntry).toHaveBeenLastCalledWith(TASK_SESSION_ENTRY_TYPE, {
      currentTaskId: null,
    });
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(CURRENT_TASK_STATUS_KEY, undefined);
    expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, undefined);
  });

  it("clears the current task when a focused task becomes cancelled", async () => {
    const initialTask = createTaskDetail();
    const cancelledTask = createTaskDetail({ status: "cancelled" });
    const getTask = vi.fn().mockResolvedValue(cancelledTask);
    const appendEntry = vi.fn();
    const ctx = createContext();
    const controller = createCurrentTaskContextController(
      { appendEntry },
      {
        runtime: {
          ensureConnected: vi.fn().mockResolvedValue({ getTask }),
          client: { on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }) },
        } as never,
      }
    );

    await controller.setCurrentTask(ctx as never, initialTask);
    await controller.handleDataChanged();

    expect(getTask).toHaveBeenCalledWith(initialTask.id);
    expect(controller.getState()).toEqual({ currentTaskId: null, currentTask: null });
    expect(appendEntry).toHaveBeenLastCalledWith(TASK_SESSION_ENTRY_TYPE, {
      currentTaskId: null,
    });
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(CURRENT_TASK_STATUS_KEY, undefined);
    expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, undefined);
  });
});
