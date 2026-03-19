import { describe, expect, it } from "vitest";

import { pickCurrentTask } from "@/flows/pick-current-task";
import { createInMemoryTaskSessionStore } from "@/services/task-session-store";

describe("task session store", () => {
  it("tracks the current task through the flow boundary", () => {
    const taskSessionStore = createInMemoryTaskSessionStore();

    pickCurrentTask({ taskSessionStore }, "task-123");
    expect(taskSessionStore.getState()).toEqual({ currentTaskId: "task-123" });

    taskSessionStore.clearCurrentTask();
    expect(taskSessionStore.getState()).toEqual({ currentTaskId: null });
  });
});
