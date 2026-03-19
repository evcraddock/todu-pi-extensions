import { describe, expect, it, vi } from "vitest";

import { pickCurrentTask } from "@/flows/pick-current-task";
import {
  createInMemoryTaskSessionStore,
  persistTaskSessionState,
  restoreTaskSessionState,
  TASK_SESSION_ENTRY_TYPE,
} from "@/services/task-session-store";

describe("task session store", () => {
  it("tracks the current task through the flow boundary", () => {
    const taskSessionStore = createInMemoryTaskSessionStore();

    pickCurrentTask({ taskSessionStore }, "task-123");
    expect(taskSessionStore.getState()).toEqual({ currentTaskId: "task-123" });

    taskSessionStore.clearCurrentTask();
    expect(taskSessionStore.getState()).toEqual({ currentTaskId: null });
  });

  it("restores the latest persisted current task from session entries", () => {
    expect(
      restoreTaskSessionState([
        {
          type: "custom",
          customType: TASK_SESSION_ENTRY_TYPE,
          data: { currentTaskId: "task-1" },
        },
        {
          type: "custom",
          customType: TASK_SESSION_ENTRY_TYPE,
          data: { currentTaskId: "task-2" },
        },
      ])
    ).toEqual({ currentTaskId: "task-2" });
  });

  it("persists current task state through appendEntry", () => {
    const appendEntry = vi.fn();

    persistTaskSessionState(appendEntry, { currentTaskId: "task-123" });

    expect(appendEntry).toHaveBeenCalledWith(TASK_SESSION_ENTRY_TYPE, {
      currentTaskId: "task-123",
    });
  });
});
