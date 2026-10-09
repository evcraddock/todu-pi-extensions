import { describe, expect, it, vi } from "vitest";

import { createToduDaemonClient } from "@/services/todu/daemon-client";
import type { ToduDaemonConnection } from "@/services/todu/daemon-connection";
import { createToduTaskService } from "@/services/todu/todu-task-service";
import {
  createTaskListToolDefinition,
  createTaskShowToolDefinition,
} from "@/tools/task-read-tools";
import { createTaskDetailViewModel } from "@/ui/components/task-detail";
import { createTaskListItem } from "@/ui/components/task-list";

const timestamps = {
  createdAt: "2026-03-07T23:30:00.000Z",
  updatedAt: "2026-03-08T01:30:00.000Z",
};

interface OptionalDates {
  dueDate?: string | null;
  scheduledDate?: string | null;
}

const createRawTask = (dates: OptionalDates = {}, id = "task-1") => ({
  id,
  title: `Task ${id}`,
  status: "active",
  priority: "medium",
  projectId: "proj-1",
  labels: [],
  assigneeActorIds: [],
  assignees: [],
  description: "Description",
  ...timestamps,
  ...dates,
});

const createPipeline = (tasks: ReturnType<typeof createRawTask>[]) => {
  const connection = {
    request: vi.fn(async (method: string, params?: { id?: string }) => {
      switch (method) {
        case "task.list":
        case "task.search":
          return { ok: true, value: tasks };
        case "task.get":
          return { ok: true, value: tasks.find((task) => task.id === params?.id) };
        case "project.list":
          return {
            ok: true,
            value: [{ id: "proj-1", name: "Project", authorizedAssigneeActorIds: [] }],
          };
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
          throw new Error(`Unexpected test RPC: ${method}`);
      }
    }),
    subscribeToEvents: vi.fn(),
  };
  const client = createToduDaemonClient({
    connection: connection as unknown as Pick<
      ToduDaemonConnection,
      "request" | "subscribeToEvents"
    >,
  });
  const service = createToduTaskService({ client });
  return { client, service, connection };
};

const cases: {
  name: string;
  dates: OptionalDates;
  expected: { dueDate: string | null; scheduledDate: string | null };
}[] = [
  { name: "absent dates", dates: {}, expected: { dueDate: null, scheduledDate: null } },
  {
    name: "undefined dates",
    dates: { dueDate: undefined, scheduledDate: undefined },
    expected: { dueDate: null, scheduledDate: null },
  },
  {
    name: "null dates",
    dates: { dueDate: null, scheduledDate: null },
    expected: { dueDate: null, scheduledDate: null },
  },
  {
    name: "date-only values",
    dates: { dueDate: "2026-03-08", scheduledDate: "2026-03-07" },
    expected: { dueDate: "2026-03-08", scheduledDate: "2026-03-07" },
  },
  {
    name: "timestamp values",
    dates: { dueDate: "2026-03-08T00:30:00+14:00", scheduledDate: "2026-03-07T23:30:00-08:00" },
    expected: { dueDate: "2026-03-08T00:30:00+14:00", scheduledDate: "2026-03-07T23:30:00-08:00" },
  },
  {
    name: "scheduled date only",
    dates: { scheduledDate: "2026-03-07" },
    expected: { dueDate: null, scheduledDate: "2026-03-07" },
  },
  {
    name: "due date only",
    dates: { dueDate: "2026-03-08" },
    expected: { dueDate: "2026-03-08", scheduledDate: null },
  },
];

describe("task date results", () => {
  it.each(cases)(
    "retains $name in task lists through mapping, enrichment, and tools",
    async ({ dates, expected }) => {
      const { client, service } = createPipeline([createRawTask(dates)]);
      const expectedDates = { ...timestamps, ...expected };
      expect((await client.listTasks())[0]).toMatchObject(expectedDates);
      expect((await service.listTasks())[0]).toMatchObject({
        ...expectedDates,
        projectName: "Project",
      });
      const tool = createTaskListToolDefinition({ getTaskService: async () => service });
      const result = await tool.execute("list", {});
      expect(result.details?.tasks[0]).toMatchObject(expectedDates);
      expect(result.structuredContent.ok).toBe(true);
      if (!result.structuredContent.ok) throw new Error("Expected a successful task list");
      expect(result.structuredContent.data.tasks[0]).toMatchObject(expectedDates);
      expect(JSON.parse(JSON.stringify(result.details)).tasks[0]).toMatchObject(expectedDates);
      if (expected.dueDate !== null) {
        expect(result.content[0].text).toContain(`due: ${expected.dueDate}`);
      } else {
        expect(result.content[0].text).not.toContain("due:");
      }
    }
  );

  it.each(cases)(
    "retains $name in task details through mapping, enrichment, and tools",
    async ({ dates, expected }) => {
      const { client, service } = createPipeline([createRawTask(dates)]);
      const expectedDates = { ...timestamps, ...expected };
      expect(await client.getTask("task-1")).toMatchObject(expectedDates);
      expect(await service.getTask("task-1")).toMatchObject({
        ...expectedDates,
        projectName: "Project",
      });
      const tool = createTaskShowToolDefinition({ getTaskService: async () => service });
      const result = await tool.execute("show", { taskId: "task-1" });
      expect(result.details?.task).toMatchObject(expectedDates);
      expect(result.structuredContent.ok).toBe(true);
      if (!result.structuredContent.ok) throw new Error("Expected a successful task detail");
      expect(result.structuredContent.data.task).toMatchObject(expectedDates);
      expect(JSON.parse(JSON.stringify(result.details)).task).toMatchObject(expectedDates);
      if (expected.dueDate !== null) {
        expect(result.content[0].text).toContain(`Due: ${expected.dueDate}`);
      } else {
        expect(result.content[0].text).not.toContain("Due:");
      }
    }
  );

  it("retains creation/update timestamp precision and offsets verbatim", async () => {
    const raw = {
      ...createRawTask(),
      createdAt: "2026-03-07T23:30:00.123456+05:45",
      updatedAt: "2026-03-08T01:30:00.987654-08:00",
    };
    const { client } = createPipeline([raw]);
    const expected = { createdAt: raw.createdAt, updatedAt: raw.updatedAt };
    expect((await client.listTasks())[0]).toMatchObject(expected);
    expect(await client.getTask(raw.id)).toMatchObject(expected);
  });

  it("leaves list/detail UI models unchanged when dates are populated", async () => {
    const undated = createPipeline([createRawTask()]);
    const dated = createPipeline([
      createRawTask({ dueDate: "2026-03-08", scheduledDate: "2026-03-07" }),
    ]);
    const undatedTask = (await undated.service.getTask("task-1"))!;
    const datedTask = (await dated.service.getTask("task-1"))!;
    expect(createTaskListItem(datedTask)).toEqual(createTaskListItem(undatedTask));
    expect(createTaskDetailViewModel(datedTask)).toEqual(createTaskDetailViewModel(undatedTask));
  });

  it("keeps dates on search results and existing due-date sort behavior", async () => {
    const { client, connection } = createPipeline([
      createRawTask({ dueDate: "2026-03-20" }, "task-late"),
      createRawTask({}, "task-undated"),
      createRawTask({ dueDate: "2026-03-08" }, "task-early"),
    ]);
    const tasks = await client.listTasks({ query: "Task", sort: "dueDate", sortDirection: "asc" });
    expect(connection.request).toHaveBeenCalledWith("task.search", { query: "Task" });
    expect(tasks.map(({ id, dueDate }) => ({ id, dueDate }))).toEqual([
      { id: "task-early", dueDate: "2026-03-08" },
      { id: "task-late", dueDate: "2026-03-20" },
      { id: "task-undated", dueDate: null },
    ]);
  });

  it("lets timestamp consumers choose absolute-time ordering using returned values", async () => {
    const { client } = createPipeline([
      createRawTask({ dueDate: "2026-03-08T00:30:00+14:00" }, "task-early"),
      createRawTask({}, "task-undated"),
      createRawTask({ dueDate: "2026-03-07T23:30:00-08:00" }, "task-late"),
    ]);
    const tasks = await client.listTasks();
    tasks.sort((a, b) => {
      if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
      if (b.dueDate === null) return -1;
      return Date.parse(a.dueDate) - Date.parse(b.dueDate);
    });
    expect(tasks.map((task) => task.id)).toEqual(["task-early", "task-late", "task-undated"]);
  });

  it("lets consumers merge, deduplicate, and sort date-only results with nulls last", async () => {
    const { client } = createPipeline([
      createRawTask({ dueDate: "2026-03-20" }, "task-late"),
      createRawTask({}, "task-undated"),
      createRawTask({ dueDate: "2026-03-08" }, "task-early"),
    ]);
    const first = await client.listTasks();
    const second = await client.listTasks();
    const merged = [...new Map([...first, ...second].map((task) => [task.id, task])).values()];
    merged.sort((a, b) => {
      if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
      if (b.dueDate === null) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    expect(merged.map((task) => task.id)).toEqual(["task-early", "task-late", "task-undated"]);
  });
});
