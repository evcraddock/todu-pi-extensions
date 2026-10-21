import { describe, expect, it, vi } from "vitest";

import type { TaskDetail, TaskId } from "@/domain/task";
import {
  createCurrentTaskContextController,
  CURRENT_TASK_STATUS_KEY,
  CURRENT_TASK_WIDGET_KEY,
} from "@/extension/current-task-context";
import { TASK_SESSION_ENTRY_TYPE } from "@/services/task-session-store";

const createTaskDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
  dueDate: overrides.dueDate ?? null,
  scheduledDate: overrides.scheduledDate ?? null,
  createdAt: overrides.createdAt ?? "2026-03-19T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-03-19T00:00:00.000Z",
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

const createDeferred = <T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createControllerHarness = () => {
  const getTask = vi.fn<(id: TaskId) => Promise<TaskDetail | null>>();
  const appendEntry = vi.fn();
  const ctx = createContext();
  const runtime = {
    ensureConnected: vi.fn().mockResolvedValue({ getTask }),
    client: { on: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }) },
  };
  const controller = createCurrentTaskContextController(
    { appendEntry },
    { runtime: runtime as never }
  );
  return { controller, ctx, getTask, appendEntry, runtime };
};

const staleOutcomes = ["inprogress", "done", "cancelled", "missing", "error"] as const;

const settleStaleResponse = (
  response: ReturnType<typeof createDeferred<TaskDetail | null>>,
  outcome: (typeof staleOutcomes)[number]
): void => {
  if (outcome === "error") {
    response.reject(new Error("Stale request failed"));
  } else {
    response.resolve(outcome === "missing" ? null : createTaskDetail({ status: outcome }));
  }
};

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

  it.each(["done", "cancelled", "missing"] as const)(
    "does not restore an older snapshot after a newer %s response clears the task",
    async (outcome) => {
      const { controller, ctx, getTask, appendEntry } = createControllerHarness();
      const task = createTaskDetail({ status: "inprogress" });
      const olderResponse = createDeferred<TaskDetail | null>();
      const newerResponse = createDeferred<TaskDetail | null>();
      getTask.mockReturnValueOnce(olderResponse.promise).mockReturnValueOnce(newerResponse.promise);
      await controller.setCurrentTask(ctx as never, task);

      const olderRefresh = controller.handleDataChanged();
      await Promise.resolve();
      const newerRefresh = controller.handleDataChanged();
      await Promise.resolve();
      expect(getTask).toHaveBeenCalledTimes(2);

      settleStaleResponse(newerResponse, outcome);
      await newerRefresh;
      expect(controller.getState()).toEqual({ currentTaskId: null, currentTask: null });
      const writesAfterClear = appendEntry.mock.calls.length;
      const rendersAfterClear = ctx.ui.setWidget.mock.calls.length;
      const statusesAfterClear = ctx.ui.setStatus.mock.calls.length;

      olderResponse.resolve(task);
      await olderRefresh;

      expect(controller.getState()).toEqual({ currentTaskId: null, currentTask: null });
      expect(appendEntry).toHaveBeenCalledTimes(writesAfterClear);
      expect(appendEntry).toHaveBeenLastCalledWith(TASK_SESSION_ENTRY_TYPE, {
        currentTaskId: null,
      });
      expect(ctx.ui.setWidget).toHaveBeenCalledTimes(rendersAfterClear);
      expect(ctx.ui.setStatus).toHaveBeenCalledTimes(statusesAfterClear);
      expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, undefined);
      expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(CURRENT_TASK_STATUS_KEY, undefined);
    }
  );

  it.each(staleOutcomes)("ignores an older %s response after a newer refresh", async (outcome) => {
    const { controller, ctx, getTask, appendEntry } = createControllerHarness();
    const olderResponse = createDeferred<TaskDetail | null>();
    const newerResponse = createDeferred<TaskDetail | null>();
    const refreshedTask = createTaskDetail({ title: "Latest snapshot", status: "inprogress" });
    getTask.mockReturnValueOnce(olderResponse.promise).mockReturnValueOnce(newerResponse.promise);
    await controller.setCurrentTask(ctx as never, createTaskDetail());

    const olderRefresh = controller.handleDataChanged();
    await Promise.resolve();
    const newerRefresh = controller.handleDataChanged();
    await Promise.resolve();
    expect(getTask).toHaveBeenCalledTimes(2);
    newerResponse.resolve(refreshedTask);
    await newerRefresh;
    appendEntry.mockClear();
    ctx.ui.setWidget.mockClear();
    ctx.ui.setStatus.mockClear();

    settleStaleResponse(olderResponse, outcome);
    await olderRefresh;

    expect(controller.getState()).toEqual({
      currentTaskId: refreshedTask.id,
      currentTask: refreshedTask,
    });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(ctx.ui.setWidget).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
  });

  describe.each(["switch", "clear", "restore", "reselect", "dispose"] as const)(
    "while a refresh is pending across %s",
    (transition) => {
      it.each(staleOutcomes)("ignores the stale %s response", async (outcome) => {
        const { controller, ctx, getTask, appendEntry } = createControllerHarness();
        const response = createDeferred<TaskDetail | null>();
        const initialTask = createTaskDetail({ status: "inprogress" });
        getTask.mockReturnValueOnce(response.promise);
        await controller.setCurrentTask(ctx as never, initialTask);
        const refresh = controller.handleDataChanged();
        await Promise.resolve();
        expect(getTask).toHaveBeenCalledTimes(1);

        const nextCtx = createContext();
        if (transition === "switch") {
          await controller.setCurrentTask(ctx as never, createTaskDetail({ id: "task-other" }));
        } else if (transition === "clear") {
          await controller.clearCurrentTask(ctx as never);
        } else if (transition === "restore") {
          nextCtx.sessionManager.getBranch.mockReturnValue([
            {
              type: "custom",
              customType: TASK_SESSION_ENTRY_TYPE,
              data: { currentTaskId: initialTask.id },
            },
          ]);
          getTask.mockResolvedValueOnce(createTaskDetail({ title: "Restored branch task" }));
          await controller.restoreFromBranch(nextCtx as never);
        } else if (transition === "reselect") {
          await controller.clearCurrentTask(ctx as never);
          await controller.setCurrentTask(
            ctx as never,
            createTaskDetail({ title: "Reselected task" })
          );
        } else {
          await controller.dispose();
        }
        const expectedState = controller.getState();
        appendEntry.mockClear();
        ctx.ui.setStatus.mockClear();
        ctx.ui.setWidget.mockClear();
        nextCtx.ui.setStatus.mockClear();
        nextCtx.ui.setWidget.mockClear();

        settleStaleResponse(response, outcome);
        await refresh;

        expect(controller.getState()).toEqual(expectedState);
        expect(appendEntry).not.toHaveBeenCalled();
        expect(ctx.ui.setStatus).not.toHaveBeenCalled();
        expect(ctx.ui.setWidget).not.toHaveBeenCalled();
        expect(nextCtx.ui.setStatus).not.toHaveBeenCalled();
        expect(nextCtx.ui.setWidget).not.toHaveBeenCalled();
      });
    }
  );

  it("ignores an older response even while the newer refresh is still pending", async () => {
    const { controller, ctx, getTask, appendEntry } = createControllerHarness();
    const task = createTaskDetail();
    const olderResponse = createDeferred<TaskDetail | null>();
    const newerResponse = createDeferred<TaskDetail | null>();
    getTask.mockReturnValueOnce(olderResponse.promise).mockReturnValueOnce(newerResponse.promise);
    await controller.setCurrentTask(ctx as never, task);
    const olderRefresh = controller.handleDataChanged();
    await Promise.resolve();
    const newerRefresh = controller.handleDataChanged();
    await Promise.resolve();
    expect(getTask).toHaveBeenCalledTimes(2);
    appendEntry.mockClear();
    ctx.ui.setStatus.mockClear();
    ctx.ui.setWidget.mockClear();

    olderResponse.resolve(createTaskDetail({ status: "done" }));
    await olderRefresh;
    expect(controller.getState()).toEqual({ currentTaskId: task.id, currentTask: task });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();
    expect(ctx.ui.setWidget).not.toHaveBeenCalled();

    const refreshedTask = createTaskDetail({ title: "Latest task" });
    newerResponse.resolve(refreshedTask);
    await newerRefresh;
    expect(controller.getState()).toEqual({ currentTaskId: task.id, currentTask: refreshedTask });
  });

  it.each(["resolve", "reject"] as const)(
    "ignores a stale connection %s after a selection change",
    async (outcome) => {
      const { controller, ctx, getTask, appendEntry, runtime } = createControllerHarness();
      const connection = createDeferred<{ getTask: typeof getTask }>();
      runtime.ensureConnected.mockReturnValueOnce(connection.promise);
      await controller.setCurrentTask(ctx as never, createTaskDetail());
      const refresh = controller.handleDataChanged();
      const nextTask = createTaskDetail({ id: "task-other" });
      await controller.setCurrentTask(ctx as never, nextTask);
      appendEntry.mockClear();
      ctx.ui.setStatus.mockClear();
      ctx.ui.setWidget.mockClear();

      if (outcome === "resolve") {
        connection.resolve({ getTask });
      } else {
        connection.reject(new Error("Stale connection failed"));
      }
      await refresh;

      expect(controller.getState()).toEqual({ currentTaskId: nextTask.id, currentTask: nextTask });
      expect(getTask).not.toHaveBeenCalled();
      expect(appendEntry).not.toHaveBeenCalled();
      expect(ctx.ui.setStatus).not.toHaveBeenCalled();
      expect(ctx.ui.setWidget).not.toHaveBeenCalled();
    }
  );

  it.each(["set", "restore"] as const)(
    "does not resume superseded %s work after subscription setup",
    async (operation) => {
      const { controller, ctx, getTask, appendEntry, runtime } = createControllerHarness();
      const subscription = createDeferred<{ unsubscribe(): void }>();
      runtime.client.on.mockReturnValueOnce(subscription.promise);
      const task = createTaskDetail();
      ctx.sessionManager.getBranch.mockReturnValue([
        { type: "custom", customType: TASK_SESSION_ENTRY_TYPE, data: { currentTaskId: task.id } },
      ]);
      const pending =
        operation === "set"
          ? controller.setCurrentTask(ctx as never, task)
          : controller.restoreFromBranch(ctx as never);
      const nextCtx = createContext();
      await controller.clearCurrentTask(nextCtx as never);
      appendEntry.mockClear();
      nextCtx.ui.setStatus.mockClear();
      nextCtx.ui.setWidget.mockClear();

      subscription.resolve({ unsubscribe: vi.fn() });
      await pending;

      expect(controller.getState()).toEqual({ currentTaskId: null, currentTask: null });
      expect(getTask).not.toHaveBeenCalled();
      expect(appendEntry).not.toHaveBeenCalled();
      expect(ctx.ui.setStatus).not.toHaveBeenCalled();
      expect(ctx.ui.setWidget).not.toHaveBeenCalled();
      expect(nextCtx.ui.setStatus).not.toHaveBeenCalled();
      expect(nextCtx.ui.setWidget).not.toHaveBeenCalled();
    }
  );

  it("keeps the current task ID and fallback UI when the latest refresh fails", async () => {
    const { controller, ctx, getTask, appendEntry } = createControllerHarness();
    const task = createTaskDetail();
    getTask.mockRejectedValueOnce(new Error("Backend unavailable"));
    await controller.setCurrentTask(ctx as never, task);
    appendEntry.mockClear();

    await controller.handleDataChanged();

    expect(controller.getState()).toEqual({ currentTaskId: task.id, currentTask: null });
    expect(appendEntry).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(CURRENT_TASK_STATUS_KEY, task.id);
    expect(ctx.ui.setWidget).toHaveBeenLastCalledWith(CURRENT_TASK_WIDGET_KEY, expect.any(Array));
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
