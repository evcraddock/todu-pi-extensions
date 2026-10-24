import { describe, expect, it, vi } from "vitest";

import type { TaskDetail } from "@/domain/task";
import type { ActorService } from "@/services/actor-service";
import type { ProjectService } from "@/services/project-service";
import type { TaskService, UpdateTaskInput } from "@/services/task-service";
import { ToduTaskServiceError } from "@/services/todu/todu-task-service";
import { createTaskUpdateToolDefinition } from "@/tools/task-mutation-tools";

type UpdateParams = Parameters<ReturnType<typeof createTaskUpdateToolDefinition>["execute"]>[1];

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const task = (id: string): TaskDetail => ({
  id,
  title: "Task",
  status: "active",
  priority: "medium",
  projectId: "project",
  projectName: "Project",
  dueDate: null,
  scheduledDate: null,
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
  labels: ["base"],
  assigneeActorIds: ["actor-user"],
  assigneeDisplayNames: ["User"],
  assignees: [],
  description: null,
  descriptionApproval: null,
  comments: [],
  outboundAssigneeWarnings: [],
});

const setup = () => {
  const tasks = new Map(["task-1", "task-2"].map((id) => [id, task(id)]));
  const read = (id: string): TaskDetail | null => structuredClone(tasks.get(id) ?? null);
  const commit = (input: UpdateTaskInput): TaskDetail => {
    const current = tasks.get(input.taskId);
    if (!current) throw new Error("Task not found");
    const next = { ...current };
    if (input.title !== undefined) next.title = input.title;
    if (input.status !== undefined) next.status = input.status;
    if (input.priority !== undefined) next.priority = input.priority;
    if (input.labels !== undefined) next.labels = [...input.labels];
    if (input.assigneeActorIds !== undefined) next.assigneeActorIds = [...input.assigneeActorIds];
    tasks.set(input.taskId, next);
    return structuredClone(next);
  };
  const getTask = vi.fn(async (id: string) => read(id));
  const updateTask = vi.fn(async (input: UpdateTaskInput) => commit(input));
  const listActors = vi.fn(async () =>
    ["actor-user", "actor-a", "actor-b"].map((id) => ({ id, displayName: id, archived: false }))
  );
  const getProject = vi.fn(async () => ({
    id: "project",
    name: "Project",
    description: null,
    status: "active" as const,
    priority: "medium" as const,
    authorizedAssigneeActorIds: ["actor-user", "actor-a", "actor-b"],
  }));
  const getTaskService = vi.fn(async () => ({ getTask, updateTask }) as unknown as TaskService);
  const tool = createTaskUpdateToolDefinition({
    getTaskService,
    getActorService: async () => ({ listActors }) as unknown as ActorService,
    getProjectService: async () => ({ getProject }) as unknown as ProjectService,
  });
  const execute = (params: UpdateParams, signal?: AbortSignal) =>
    tool.execute("call", params, signal);
  // An unrelated task provides a deterministic progress barrier, not a timer or
  // scheduler-dependent sleep, while same-task work must remain queued.
  const otherTask = () => execute({ taskId: "task-2", title: "Other progresses" });
  return {
    tasks,
    read,
    commit,
    getTask,
    updateTask,
    listActors,
    getProject,
    getTaskService,
    execute,
    otherTask,
  };
};

describe("task_update concurrency", () => {
  it.each([
    {
      name: "labels",
      first: { labels: ["one"] },
      second: { labels: ["two"] },
      expected: { labels: ["base", "one", "two"] },
    },
    {
      name: "assignees",
      first: { addAssigneeActorIds: ["actor-a"] },
      second: { addAssigneeActorIds: ["actor-b"] },
      expected: { assigneeActorIds: ["actor-user", "actor-a", "actor-b"] },
    },
    {
      name: "mixed add/remove",
      first: { labels: ["one"], addAssigneeActorIds: ["actor-a"] },
      second: {
        labels: ["two"],
        removeLabels: ["base"],
        addAssigneeActorIds: ["actor-b"],
        removeAssigneeActorIds: ["actor-user"],
      },
      expected: { labels: ["one", "two"], assigneeActorIds: ["actor-a", "actor-b"] },
    },
  ])(
    "preserves both $name updates across the entire read/validate/write window",
    async ({ first, second, expected }) => {
      const fixture = setup();
      const readEntered = deferred();
      const releaseRead = deferred();
      const writeEntered = deferred();
      const releaseWrite = deferred();
      fixture.getTask.mockImplementationOnce(async (id) => {
        const snapshot = fixture.read(id);
        readEntered.resolve();
        await releaseRead.promise;
        return snapshot;
      });
      let firstWrite = true;
      fixture.updateTask.mockImplementation(async (input) => {
        if (input.taskId === "task-1" && firstWrite) {
          firstWrite = false;
          writeEntered.resolve();
          await releaseWrite.promise;
        }
        return fixture.commit(input);
      });
      const one = fixture.execute({ taskId: "task-1", ...first });
      await readEntered.promise;
      const two = fixture.execute({ taskId: " task-1 ", ...second });
      await fixture.otherTask();
      expect(fixture.getTask.mock.calls.filter(([id]) => id === "task-1")).toHaveLength(1);
      expect(
        fixture.updateTask.mock.calls.filter(([input]) => input.taskId === "task-1")
      ).toHaveLength(0);
      releaseRead.resolve();
      await writeEntered.promise;
      const readsBeforeWriteSettles = fixture.getTask.mock.calls.length;
      await fixture.otherTask();
      expect(fixture.getTask).toHaveBeenCalledTimes(readsBeforeWriteSettles);
      releaseWrite.resolve();
      await Promise.all([one, two]);
      expect(fixture.tasks.get("task-1")).toMatchObject(expected);
      expect(
        fixture.updateTask.mock.calls.filter(([input]) => input.taskId === "task-1")
      ).toHaveLength(2);
      if ("assigneeActorIds" in expected) {
        expect(fixture.listActors).toHaveBeenCalledTimes(2);
        expect(fixture.getProject).toHaveBeenCalledTimes(2);
      }
    }
  );

  it("serializes explicit replacement with incremental assignment updates", async () => {
    const fixture = setup();
    const entered = deferred();
    const release = deferred();
    fixture.updateTask.mockImplementationOnce(async (input) => {
      entered.resolve();
      await release.promise;
      return fixture.commit(input);
    });
    const first = fixture.execute({ taskId: "task-1", assigneeActorIds: [] });
    await entered.promise;
    const second = fixture.execute({ taskId: "task-1", addAssigneeActorIds: ["actor-b"] });
    await fixture.otherTask();
    expect(fixture.listActors).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    expect(fixture.tasks.get("task-1")?.assigneeActorIds).toEqual(["actor-b"]);
    expect(fixture.listActors).toHaveBeenCalledTimes(2);
  });

  it.each(["read", "validation", "write", "uncertain"] as const)(
    "releases after %s failure and validates the next update",
    async (failure) => {
      const fixture = setup();
      const entered = deferred();
      const release = deferred();
      fixture.getTask.mockImplementationOnce(async (id) => {
        entered.resolve();
        await release.promise;
        if (failure === "read") throw new Error("Read failed");
        return fixture.read(id);
      });
      if (failure === "write" || failure === "uncertain") {
        let failNextTaskOneWrite = true;
        fixture.updateTask.mockImplementation(async (input) => {
          if (input.taskId === "task-1" && failNextTaskOneWrite) {
            failNextTaskOneWrite = false;
            throw failure === "write"
              ? new Error("Write failed")
              : new ToduTaskServiceError({
                  operation: "updateTask",
                  causeCode: "uncertain",
                  mutationOutcome: "uncertain",
                  message: "Unknown dispatch",
                });
          }
          return fixture.commit(input);
        });
      }
      const first = fixture.execute({
        taskId: "task-1",
        addAssigneeActorIds: [failure === "validation" ? "missing" : "actor-a"],
      });
      const rejected = expect(first).rejects.toThrow();
      await entered.promise;
      const second = fixture.execute({ taskId: "task-1", addAssigneeActorIds: ["actor-b"] });
      await fixture.otherTask();
      release.resolve();
      await rejected;
      await second;
      expect(fixture.tasks.get("task-1")?.assigneeActorIds).toEqual(["actor-user", "actor-b"]);
      expect(fixture.listActors).toHaveBeenCalledTimes(failure === "read" ? 1 : 2);
      expect(
        fixture.updateTask.mock.calls.filter(([input]) => input.taskId === "task-1")
      ).toHaveLength(failure === "read" || failure === "validation" ? 1 : 2);
    }
  );

  it.each(["archived", "unauthorized"] as const)(
    "rechecks %s authorization after a predecessor changes task state",
    async (kind) => {
      const fixture = setup();
      const entered = deferred();
      const release = deferred();
      fixture.listActors.mockResolvedValue(
        ["actor-user", "actor-a", "actor-b"].map((id) => ({
          id,
          displayName: id,
          archived: kind === "archived" && id === "actor-a",
        }))
      );
      if (kind === "unauthorized")
        fixture.getProject.mockResolvedValue({
          id: "project",
          name: "Project",
          description: null,
          status: "active",
          priority: "medium",
          authorizedAssigneeActorIds: ["actor-user", "actor-b"],
        });
      // A stale, currently assigned actor may be retained, but removing it first
      // means a queued re-add must undergo new-assignment authorization.
      fixture.tasks.get("task-1")!.assigneeActorIds.push("actor-a");
      fixture.updateTask.mockImplementationOnce(async (input) => {
        entered.resolve();
        await release.promise;
        return fixture.commit(input);
      });
      const first = fixture.execute({ taskId: "task-1", removeAssigneeActorIds: ["actor-a"] });
      await entered.promise;
      const second = fixture.execute({ taskId: "task-1", addAssigneeActorIds: ["actor-a"] });
      const rejected = expect(second).rejects.toThrow(
        kind === "archived" ? "actor is archived" : "actor is not authorized"
      );
      release.resolve();
      await first;
      await rejected;
      expect(fixture.updateTask).toHaveBeenCalledTimes(1);
      expect(fixture.listActors).toHaveBeenCalledTimes(2);
    }
  );

  it("skips a cancelled waiter and preserves ordering for its successor", async () => {
    const fixture = setup();
    const entered = deferred();
    const release = deferred();
    fixture.updateTask.mockImplementationOnce(async (input) => {
      entered.resolve();
      await release.promise;
      return fixture.commit(input);
    });
    const first = fixture.execute({ taskId: "task-1", labels: ["one"] });
    await entered.promise;
    const controller = new AbortController();
    const cancelled = fixture.execute({ taskId: "task-1", labels: ["skip"] }, controller.signal);
    const rejected = expect(cancelled).rejects.toThrow("cancelled before write dispatch");
    const third = fixture.execute({ taskId: "task-1", labels: ["three"] });
    controller.abort();
    await rejected;
    await fixture.otherTask();
    expect(fixture.getTask.mock.calls.filter(([id]) => id === "task-1")).toHaveLength(1);
    release.resolve();
    await Promise.all([first, third]);
    expect(fixture.tasks.get("task-1")?.labels).toEqual(["base", "one", "three"]);
  });

  it("stops an active cancelled read before dispatch without releasing its lock early", async () => {
    const fixture = setup();
    const entered = deferred();
    const release = deferred();
    fixture.getTask.mockImplementationOnce(async (id) => {
      entered.resolve();
      await release.promise;
      return fixture.read(id);
    });
    const controller = new AbortController();
    const first = fixture.execute(
      { taskId: "task-1", addAssigneeActorIds: ["actor-a"] },
      controller.signal
    );
    const rejected = expect(first).rejects.toThrow("cancelled before write dispatch");
    await entered.promise;
    controller.abort();
    const second = fixture.execute({ taskId: "task-1", addAssigneeActorIds: ["actor-b"] });
    await fixture.otherTask();
    expect(fixture.getTask.mock.calls.filter(([id]) => id === "task-1")).toHaveLength(1);
    expect(fixture.listActors).not.toHaveBeenCalled();
    release.resolve();
    await rejected;
    await second;
    expect(fixture.tasks.get("task-1")?.assigneeActorIds).toEqual(["actor-user", "actor-b"]);
    expect(
      fixture.updateTask.mock.calls.filter(([input]) => input.taskId === "task-1")
    ).toHaveLength(1);
  });

  it("preserves a dispatched write despite cancellation and makes its successor read committed state", async () => {
    const fixture = setup();
    const entered = deferred();
    const release = deferred();
    fixture.updateTask.mockImplementationOnce(async (input) => {
      entered.resolve();
      await release.promise;
      return fixture.commit(input);
    });
    const controller = new AbortController();
    const first = fixture.execute({ taskId: "task-1", labels: ["one"] }, controller.signal);
    await entered.promise;
    controller.abort();
    const second = fixture.execute({ taskId: "task-1", labels: ["two"] });
    await fixture.otherTask();
    expect(fixture.getTask.mock.calls.filter(([id]) => id === "task-1")).toHaveLength(1);
    release.resolve();
    await expect(first).resolves.toMatchObject({ details: { task: { labels: ["base", "one"] } } });
    await second;
    expect(fixture.tasks.get("task-1")?.labels).toEqual(["base", "one", "two"]);
  });

  it.each(["service", "project", "actors"] as const)(
    "stops cancellation during %s acquisition/validation before writing",
    async (stage) => {
      const fixture = setup();
      const entered = deferred();
      const release = deferred();
      if (stage === "service") {
        fixture.getTaskService.mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
          return {
            getTask: fixture.getTask,
            updateTask: fixture.updateTask,
          } as unknown as TaskService;
        });
      } else if (stage === "project") {
        const project = await fixture.getProject();
        fixture.getProject.mockClear().mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
          return project;
        });
      } else {
        const actors = await fixture.listActors();
        fixture.listActors.mockClear().mockImplementationOnce(async () => {
          entered.resolve();
          await release.promise;
          return actors;
        });
      }
      const controller = new AbortController();
      const first = fixture.execute(
        { taskId: "task-1", addAssigneeActorIds: ["actor-a"] },
        controller.signal
      );
      const rejected = expect(first).rejects.toThrow("cancelled before write dispatch");
      await entered.promise;
      controller.abort();
      release.resolve();
      await rejected;
      expect(fixture.updateTask).not.toHaveBeenCalled();
      await fixture.execute({ taskId: "task-1", addAssigneeActorIds: ["actor-b"] });
      expect(fixture.tasks.get("task-1")?.assigneeActorIds).toEqual(["actor-user", "actor-b"]);
    }
  );

  it("ignores already-aborted work before acquiring services", async () => {
    const fixture = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      fixture.execute({ taskId: "task-1", labels: ["skip"] }, controller.signal)
    ).rejects.toThrow("cancelled before write dispatch");
    expect(fixture.getTaskService).not.toHaveBeenCalled();
    await fixture.execute({ taskId: "task-1", labels: ["next"] });
    expect(fixture.tasks.get("task-1")?.labels).toEqual(["base", "next"]);
  });

  it.each([
    {},
    { assigneeActorIds: null, addAssigneeActorIds: null, removeAssigneeActorIds: null },
    { addAssigneeActorIds: [], removeAssigneeActorIds: [] },
  ])("preserves status-only assignment semantics in queued execution: %j", async (assignees) => {
    const fixture = setup();
    await Promise.all([
      fixture.execute({ taskId: "task-1", labels: ["one"] }),
      fixture.execute({ taskId: "task-1", status: "done", ...assignees }),
    ]);
    expect(fixture.getTask).toHaveBeenCalledTimes(1);
    expect(fixture.updateTask.mock.calls[1]?.[0]).not.toHaveProperty("assigneeActorIds");
    expect(fixture.tasks.get("task-1")?.assigneeActorIds).toEqual(["actor-user"]);
  });
});
