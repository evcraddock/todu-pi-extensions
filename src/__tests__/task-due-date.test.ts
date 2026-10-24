import { validateToolArguments } from "@earendil-works/pi-ai";
import { validateISODate } from "@todu/core";
import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";

import { createToduDaemonClient } from "@/services/todu/daemon-client";
import { createToduTaskService } from "@/services/todu/todu-task-service";
import {
  createTaskUpdateToolDefinition,
  normalizeUpdateTaskInput,
} from "@/tools/task-mutation-tools";
import { normalizeTaskDueDate } from "@/utils/task-due-date";

const validDates: [string, string][] = [
  ["2026-11-01", "2026-11-01"],
  [" 2026-11-01 ", "2026-11-01"],
  ["November 1, 2026", "2026-11-01"],
  ["November 1 2026", "2026-11-01"],
  ["1 November 2026", "2026-11-01"],
  ["  1   nOv   2026 ", "2026-11-01"],
  ["Nov 1, 2026", "2026-11-01"],
  ["2028-02-29", "2028-02-29"],
  ["February 29, 2000", "2000-02-29"],
  ["0001-01-01", "0001-01-01"],
  ["9999-12-31", "9999-12-31"],
];
const invalidDates = [
  "",
  "   ",
  "not-a-date",
  "2026-02-29",
  "1900-02-29",
  "2100-02-29",
  "2026-04-31",
  "31 April 2026",
  "February 30, 2028",
  "2026-00-01",
  "2026-13-01",
  "2026-11-00",
  "2026-11-32",
  "0000-01-01",
  "10000-01-01",
  "2026-1-1",
  "11/01/2026",
  "01/11/26",
  "11-01-2026",
  "November 1",
  "1 Nov 26",
  "November 1, 2026 extra",
  "Notamonth 1, 2026",
  "tomorrow",
  "next Friday",
  "2026-11-01T00:00:00Z",
  "2026-11-01T23:30:00-08:00",
];

const initialTask = {
  id: "task-1",
  title: "Due date task",
  status: "active",
  priority: "medium",
  projectId: "proj-1",
  description: "Original description",
  labels: ["existing"],
  assigneeActorIds: ["actor-old"],
  assignees: [],
  dueDate: undefined as string | undefined,
  scheduledDate: "2026-10-30T10:00:00-06:00",
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
};

const createRuntime = () => {
  let currentTask = { ...initialTask };
  const request = vi.fn(async (method: string, params?: { input?: Record<string, unknown> }) => {
    switch (method) {
      case "task.update": {
        const input = Object.fromEntries(
          Object.entries(params?.input ?? {}).filter(([, value]) => value !== undefined)
        );
        currentTask = { ...currentTask, ...input };
        return { ok: true, value: currentTask };
      }
      case "task.get":
        return { ok: true, value: currentTask };
      case "project.get":
        return {
          ok: true,
          value: { id: "proj-1", name: "Project", authorizedAssigneeActorIds: [] },
        };
      case "actor.list":
      case "note.list":
      case "integration.binding.list":
        return { ok: true, value: [] };
      default:
        throw new Error(`Unexpected RPC: ${method}`);
    }
  });
  const client = createToduDaemonClient({
    connection: { request, subscribeToEvents: vi.fn() } as never,
  });
  const taskService = createToduTaskService({ client });
  const tool = createTaskUpdateToolDefinition({ getTaskService: async () => taskService });
  const execute = async (args: Record<string, unknown>) => {
    const params = validateToolArguments(tool as never, {
      type: "toolCall",
      id: "update",
      name: tool.name,
      arguments: args as never,
    });
    return tool.execute("update", params as never);
  };
  return { request, taskService, tool, execute };
};

describe("due-date normalization", () => {
  it.each(validDates)("normalizes %s to %s", (value, expected) => {
    expect(normalizeTaskDueDate(value)).toBe(expected);
    expect(validateISODate("dueDate", expected)).toBeNull();
  });

  it.each([
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ])("accepts full and abbreviated month %s", (month) => {
    const full = normalizeTaskDueDate(`${month} 15, 2026`);
    expect(normalizeTaskDueDate(`15 ${month.slice(0, 3)} 2026`)).toBe(full);
  });

  it.each(invalidDates)("rejects invalid or ambiguous %j", (value) => {
    expect(() => normalizeTaskDueDate(value)).toThrow(
      "dueDate must be a valid, unambiguous calendar date"
    );
  });

  it("leaves an omitted or undefined dueDate out of normalized updates", () => {
    expect(normalizeUpdateTaskInput({ taskId: "task-1", title: "Renamed" })).not.toHaveProperty(
      "dueDate"
    );
    expect(
      normalizeUpdateTaskInput({ taskId: "task-1", title: "Renamed", dueDate: undefined })
    ).not.toHaveProperty("dueDate");
  });
});

describe("task_update due dates", () => {
  it.each(validDates)(
    "passes %s as %s through schema, tool, service, and RPC",
    async (value, expected) => {
      const { request, execute } = createRuntime();
      const result = await execute({ taskId: "task-1", dueDate: value });
      expect(request).toHaveBeenCalledWith("task.update", {
        id: "task-1",
        input: expect.objectContaining({ dueDate: expected }),
      });
      expect(result.details.input).toMatchObject({ dueDate: expected });
      expect(result.details.task).toMatchObject({
        dueDate: expected,
        scheduledDate: initialTask.scheduledDate,
      });
      expect(result.content[0]?.text).toContain(`dueDate=${expected}`);
    }
  );

  it("sets, changes, and then preserves a due date when omitted", async () => {
    const { request, execute, taskService } = createRuntime();
    await execute({ taskId: "task-1", dueDate: "2026-11-01" });
    const changed = await execute({ taskId: "task-1", dueDate: "2 November 2026" });
    expect(changed.details.task.dueDate).toBe("2026-11-02");
    request.mockClear();
    const renamed = await execute({ taskId: "task-1", title: "Renamed" });
    expect(renamed.details.input).not.toHaveProperty("dueDate");
    const updateCall = request.mock.calls.find(([method]) => method === "task.update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.input).not.toHaveProperty("dueDate");
    expect((await taskService.getTask("task-1"))?.dueDate).toBe("2026-11-02");
  });

  it.each([
    {
      title: "Renamed",
      status: "inprogress",
      priority: "high",
      description: "Updated",
      scheduledDate: "2026-10-31",
    },
    { labels: ["new"], removeLabels: ["existing"] },
    { addAssigneeActorIds: ["actor-new"], removeAssigneeActorIds: ["actor-old"] },
    { assigneeActorIds: ["actor-new"] },
    { assigneeActorIds: [] },
  ])("retains dueDate alongside existing update fields %j", async (fields) => {
    const { execute } = createRuntime();
    const result = await execute({ taskId: "task-1", dueDate: "Nov 1, 2026", ...fields });
    expect(result.details.task.dueDate).toBe("2026-11-01");
    if ("title" in fields) expect(result.details.task).toMatchObject(fields);
    if ("labels" in fields) expect(result.details.task.labels).toEqual(["new"]);
    if ("addAssigneeActorIds" in fields)
      expect(result.details.task.assigneeActorIds).toEqual(["actor-new"]);
    if ("assigneeActorIds" in fields)
      expect(result.details.task.assigneeActorIds).toEqual(fields.assigneeActorIds);
  });

  it.each(invalidDates)("rejects %j before RPC even alongside valid changes", async (value) => {
    const { request, execute } = createRuntime();
    await expect(
      execute({ taskId: "task-1", dueDate: value, title: "Do not apply", labels: ["new"] })
    ).rejects.toThrow("task_update failed: dueDate");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([null, 123, {}, []])(
    "rejects non-string %j in the schema and direct execution",
    async (value) => {
      const { request, tool } = createRuntime();
      expect(Value.Check(tool.parameters, { taskId: "task-1", dueDate: value })).toBe(false);
      await expect(
        tool.execute("bypass", { taskId: "task-1", dueDate: value } as never)
      ).rejects.toThrow("task_update failed: dueDate");
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([123, {}, []])("rejects invalid %j even after Pi argument coercion", async (value) => {
    const { request, execute } = createRuntime();
    await expect(execute({ taskId: "task-1", dueDate: value })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not clear a due date when Pi strips an optional null argument", async () => {
    const { request, execute } = createRuntime();
    await execute({ taskId: "task-1", dueDate: "2026-11-01" });
    request.mockClear();
    const result = await execute({ taskId: "task-1", dueDate: null, title: "Renamed" });
    expect(result.details.task.dueDate).toBe("2026-11-01");
    expect(result.details.input).not.toHaveProperty("dueDate");
    const updateCall = request.mock.calls.find(([method]) => method === "task.update");
    expect(updateCall?.[1]?.input).not.toHaveProperty("dueDate");
  });
});
