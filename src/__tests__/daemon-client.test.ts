import { describe, expect, it, vi } from "vitest";

import { createToduDaemonClient } from "@/services/todu/daemon-client";
import type { ToduDaemonConnection } from "@/services/todu/daemon-connection";
import type { ToduDaemonEvent } from "@/services/todu/daemon-events";

const createConnectionMock = () => ({
  request: vi.fn(),
  subscribeToEvents: vi.fn(),
});

describe("createToduDaemonClient", () => {
  it("maps task list results into local task summaries", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "task-1",
          title: "Ship wrapper",
          status: "canceled",
          priority: "high",
          projectId: "proj-1",
          labels: ["daemon"],
          assignees: [],
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listTasks({ statuses: ["cancelled"] })).resolves.toEqual([
      {
        id: "task-1",
        title: "Ship wrapper",
        status: "cancelled",
        priority: "high",
        projectId: "proj-1",
        projectName: null,
        labels: ["daemon"],
        assigneeActorIds: [],
        assigneeDisplayNames: [],
        assignees: [],
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("task.list", {
      filter: {
        projectId: undefined,
        priority: undefined,
        status: "canceled",
        label: undefined,
        overdue: undefined,
        today: undefined,
        createdFrom: undefined,
        createdTo: undefined,
        updatedFrom: undefined,
        updatedTo: undefined,
        timezone: undefined,
      },
    });
  });

  it("passes label, overdue, and today filters to the daemon", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({ ok: true, value: [] });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await client.listTasks({ label: "urgent", overdue: true, today: false });

    expect(connection.request).toHaveBeenCalledWith("task.list", {
      filter: expect.objectContaining({
        label: "urgent",
        overdue: true,
        today: false,
      }),
    });
  });

  it("passes creation date, updated date, and timezone filters to the daemon", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({ ok: true, value: [] });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await client.listTasks({
      from: "2026-01-01",
      to: "2026-12-31",
      updatedFrom: "2026-03-01",
      updatedTo: "2026-03-31",
      timezone: "America/Chicago",
    });

    expect(connection.request).toHaveBeenCalledWith("task.list", {
      filter: expect.objectContaining({
        createdFrom: "2026-01-01",
        createdTo: "2026-12-31",
        updatedFrom: "2026-03-01",
        updatedTo: "2026-03-31",
        timezone: "America/Chicago",
      }),
    });
  });

  it("sorts tasks by the requested field and direction", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "task-b",
          title: "Bravo",
          status: "active",
          priority: "low",
          projectId: "proj-1",
          labels: [],
          assignees: [],
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
        {
          id: "task-a",
          title: "Alpha",
          status: "active",
          priority: "high",
          projectId: "proj-1",
          labels: [],
          assignees: [],
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    const tasks = await client.listTasks({ sort: "title", sortDirection: "asc" });
    expect(tasks[0]?.id).toBe("task-a");
    expect(tasks[1]?.id).toBe("task-b");
  });

  it("uses legacy assignee names when actor ids cannot be resolved", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "task-1",
            title: "Ship wrapper",
            status: "active",
            priority: "high",
            projectId: "proj-1",
            labels: ["daemon"],
            assigneeActorIds: ["actor-user", "actor-reviewer"],
            assignees: ["Erik", "Reviewer"],
            createdAt: "2026-03-19T00:00:00.000Z",
            updatedAt: "2026-03-19T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [{ id: "actor-reviewer", displayName: "Reviewer" }],
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listTasks()).resolves.toEqual([
      expect.objectContaining({
        assigneeActorIds: ["actor-user", "actor-reviewer"],
        assigneeDisplayNames: ["Erik", "Reviewer"],
        assignees: ["Erik", "Reviewer"],
      }),
    ]);
  });

  it("falls back cleanly when actor.list fails during actor-backed task hydration", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "task-1",
            title: "Ship wrapper",
            status: "active",
            priority: "high",
            projectId: "proj-1",
            labels: ["daemon"],
            assigneeActorIds: ["actor-user"],
            assignees: ["Erik"],
            createdAt: "2026-03-19T00:00:00.000Z",
            updatedAt: "2026-03-19T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "DAEMON_UNAVAILABLE", message: "actor list unavailable" },
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listTasks()).resolves.toEqual([
      expect.objectContaining({
        assigneeDisplayNames: ["Erik"],
      }),
    ]);
  });

  it("hydrates task detail with task notes", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "task-1",
          title: "Ship wrapper",
          status: "active",
          priority: "medium",
          projectId: "proj-1",
          labels: ["daemon"],
          assignees: [],
          description: "Implement the typed client wrapper",
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            id: "note-1",
            content: "First note",
            author: "user",
            entityType: "task",
            entityId: "task-1",
            tags: [],
            createdAt: "2026-03-19T01:00:00.000Z",
          },
        ],
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.getTask("task-1")).resolves.toEqual({
      id: "task-1",
      title: "Ship wrapper",
      status: "active",
      priority: "medium",
      projectId: "proj-1",
      projectName: null,
      labels: ["daemon"],
      assigneeActorIds: [],
      assigneeDisplayNames: [],
      assignees: [],
      description: "Implement the typed client wrapper",
      descriptionApproval: null,
      comments: [
        {
          id: "note-1",
          taskId: "task-1",
          content: "First note",
          authorActorId: null,
          authorDisplayName: "user",
          author: "user",
          contentApproval: null,
          createdAt: "2026-03-19T01:00:00.000Z",
        },
      ],
      outboundAssigneeWarnings: [],
    });
  });

  it("returns null for task.get not found", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "task not found",
        details: { id: "task-missing" },
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.getTask("task-missing")).resolves.toBeNull();
  });

  it("maps daemon failures into client errors", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "invalid request",
        details: { field: "title" },
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listProjects()).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "validation",
        method: "project.list",
        message: "project.list failed (VALIDATION_ERROR): invalid request",
      })
    );
  });

  it("updates tasks through task.update with title changes", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "task-1",
          title: "Renamed task",
          status: "active",
          priority: "medium",
          projectId: "proj-1",
          labels: ["daemon"],
          assignees: [],
          description: "Implement the typed client wrapper",
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: [],
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.updateTask({
        taskId: "task-1",
        title: "Renamed task",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "task-1",
        title: "Renamed task",
      })
    );
    expect(connection.request).toHaveBeenNthCalledWith(1, "task.update", {
      id: "task-1",
      input: {
        title: "Renamed task",
        status: undefined,
        priority: undefined,
        description: undefined,
      },
    });
  });

  it("creates task comments through note.create", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "note-1",
        content: "Looks good",
        author: "user",
        entityType: "task",
        entityId: "task-1",
        tags: [],
        createdAt: "2026-03-19T02:00:00.000Z",
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.addTaskComment({ taskId: "task-1", content: "Looks good" })
    ).resolves.toEqual({
      id: "note-1",
      taskId: "task-1",
      content: "Looks good",
      authorActorId: null,
      authorDisplayName: "user",
      author: "user",
      contentApproval: null,
      createdAt: "2026-03-19T02:00:00.000Z",
    });
    expect(connection.request).toHaveBeenCalledWith("note.create", {
      input: {
        content: "Looks good",
        entityType: "task",
        entityId: "task-1",
      },
    });
  });

  it("creates projects through project.create", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "proj-1",
        name: "Created Project",
        status: "active",
        priority: "high",
        description: "Created from tests",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.createProject({
        name: "Created Project",
        description: "Created from tests",
        priority: "high",
      })
    ).resolves.toEqual({
      id: "proj-1",
      name: "Created Project",
      status: "active",
      priority: "high",
      description: "Created from tests",
      authorizedAssigneeActorIds: [],
    });
    expect(connection.request).toHaveBeenCalledWith("project.create", {
      input: {
        name: "Created Project",
        description: "Created from tests",
        priority: "high",
      },
    });
  });

  it("updates projects through project.update", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "proj-1",
        name: "Updated Project",
        status: "canceled",
        priority: "low",
        description: "Updated from tests",
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.updateProject({
        projectId: "proj-1",
        name: "Updated Project",
        description: "Updated from tests",
        status: "cancelled",
        priority: "low",
      })
    ).resolves.toEqual({
      id: "proj-1",
      name: "Updated Project",
      status: "cancelled",
      priority: "low",
      description: "Updated from tests",
      authorizedAssigneeActorIds: [],
    });
    expect(connection.request).toHaveBeenCalledWith("project.update", {
      id: "proj-1",
      input: {
        name: "Updated Project",
        description: "Updated from tests",
        status: "canceled",
        priority: "low",
      },
    });
  });

  it("deletes projects through project.delete", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: null,
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.deleteProject("proj-1")).resolves.toEqual({
      projectId: "proj-1",
      deleted: true,
    });
    expect(connection.request).toHaveBeenCalledWith("project.delete", { id: "proj-1" });
  });

  it("maps project mutation failures into client errors", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "CONFLICT",
          message: "duplicate project name",
          details: { name: "Created Project" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "project not found",
          details: { id: "proj-missing" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid project update",
          details: { field: "status" },
        },
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.createProject({ name: "Created Project" })).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "conflict",
        method: "project.create",
        message: "project.create failed (CONFLICT): duplicate project name",
      })
    );
    await expect(
      client.updateProject({ projectId: "proj-missing", name: "Updated Project" })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "not-found",
        method: "project.update",
        message: "project.update failed (NOT_FOUND): project not found",
      })
    );
    await expect(client.deleteProject("proj-1")).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "validation",
        method: "project.delete",
        message: "project.delete failed (VALIDATION_ERROR): invalid project update",
      })
    );
  });

  it("lists integration bindings through integration.list", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "ibind-1",
          provider: "github",
          projectId: "proj-1",
          targetKind: "repository",
          targetRef: "evcraddock/todu-pi-extensions",
          strategy: "bidirectional",
          enabled: true,
          createdAt: "2026-03-19T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
      ],
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listIntegrationBindings({ provider: "github" })).resolves.toEqual([
      {
        id: "ibind-1",
        provider: "github",
        projectId: "proj-1",
        targetKind: "repository",
        targetRef: "evcraddock/todu-pi-extensions",
        strategy: "bidirectional",
        enabled: true,
        options: undefined,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("integration.list", {
      filter: {
        provider: "github",
        projectId: undefined,
        enabled: undefined,
      },
    });
  });

  it("creates integration bindings through integration.create", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "ibind-1",
        provider: "github",
        projectId: "proj-1",
        targetKind: "repository",
        targetRef: "evcraddock/todu-pi-extensions",
        strategy: "bidirectional",
        enabled: true,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z",
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.createIntegrationBinding({
        provider: "github",
        projectId: "proj-1",
        targetKind: "repository",
        targetRef: "evcraddock/todu-pi-extensions",
      })
    ).resolves.toEqual({
      id: "ibind-1",
      provider: "github",
      projectId: "proj-1",
      targetKind: "repository",
      targetRef: "evcraddock/todu-pi-extensions",
      strategy: "bidirectional",
      enabled: true,
      options: undefined,
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z",
    });
    expect(connection.request).toHaveBeenCalledWith("integration.create", {
      input: {
        provider: "github",
        projectId: "proj-1",
        targetKind: "repository",
        targetRef: "evcraddock/todu-pi-extensions",
        strategy: undefined,
        enabled: undefined,
        options: undefined,
      },
    });
  });

  it("maps integration failures into client errors", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid integration filter",
          details: { field: "provider" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "CONFLICT",
          message: "project already has an integration binding",
          details: { projectId: "proj-1" },
        },
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listIntegrationBindings()).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "validation",
        method: "integration.list",
        message: "integration.list failed (VALIDATION_ERROR): invalid integration filter",
      })
    );
    await expect(
      client.createIntegrationBinding({
        provider: "github",
        projectId: "proj-1",
        targetKind: "repository",
        targetRef: "evcraddock/todu-pi-extensions",
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "conflict",
        method: "integration.create",
        message: "integration.create failed (CONFLICT): project already has an integration binding",
      })
    );
  });

  it("adapts event subscriptions through the connection manager", async () => {
    const connection = createConnectionMock();
    const subscription = { unsubscribe: vi.fn() };
    connection.subscribeToEvents.mockImplementation(
      async (_events: readonly string[], listener: (event: ToduDaemonEvent) => void) => {
        listener({ name: "data.changed", payload: { ok: true } });
        return subscription;
      }
    );

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });
    const listener = vi.fn();

    await expect(client.on("data.changed", listener)).resolves.toBe(subscription);
    expect(connection.subscribeToEvents).toHaveBeenCalledWith(
      ["data.changed"],
      expect.any(Function)
    );
    expect(listener).toHaveBeenCalledWith({ name: "data.changed", payload: { ok: true } });
  });

  it("deletes a task through task.delete", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({ ok: true, value: null });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    const result = await client.deleteTask("task-1");

    expect(result).toEqual({ taskId: "task-1", deleted: true });
    expect(connection.request).toHaveBeenCalledWith("task.delete", { id: "task-1" });
  });

  it("throws a client error when task.delete fails", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "Task not found" },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.deleteTask("task-missing")).rejects.toThrow("task.delete failed");
  });

  it("moves a task through task.move", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "task-new",
          title: "Moved task",
          status: "active",
          priority: "medium",
          projectId: "proj-2",
          labels: [],
          description: "desc",
          assignees: [],
          createdAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({ ok: true, value: [] });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    const result = await client.moveTask({ taskId: "task-1", targetProjectId: "proj-2" });

    expect(result.sourceTaskId).toBe("task-1");
    expect(result.targetTask.id).toBe("task-new");
    expect(connection.request).toHaveBeenCalledWith("task.move", {
      id: "task-1",
      targetProjectId: "proj-2",
    });
  });

  it("throws a client error when task.move fails", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "Task not found" },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.moveTask({ taskId: "task-missing", targetProjectId: "proj-2" })
    ).rejects.toThrow("task.move failed");
  });

  it("lists notes with filter mapped to daemon NoteFilter", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "note-1",
          content: "Journal entry",
          author: "user",
          tags: ["daily"],
          createdAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    const notes = await client.listNotes({
      tag: "daily",
      from: "2026-03-01",
      to: "2026-03-31",
      journal: true,
      timezone: "America/Chicago",
    });

    expect(notes).toEqual([
      {
        id: "note-1",
        content: "Journal entry",
        authorActorId: null,
        authorDisplayName: "user",
        author: "user",
        contentApproval: null,
        entityType: null,
        entityId: null,
        tags: ["daily"],
        createdAt: "2026-03-20T00:00:00.000Z",
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("note.list", {
      filter: {
        entityType: undefined,
        entityId: undefined,
        tag: "daily",
        author: undefined,
        authorActorId: undefined,
        createdFrom: "2026-03-01",
        createdTo: "2026-03-31",
        journal: true,
        timezone: "America/Chicago",
      },
    });
  });

  it("maps entity type and id for scoped note queries", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "note-2",
          content: "Task comment",
          author: "user",
          entityType: "task",
          entityId: "task-123",
          tags: [],
          createdAt: "2026-03-20T00:00:00.000Z",
        },
      ],
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    const notes = await client.listNotes({ entityType: "task", entityId: "task-123" });

    expect(notes[0]?.entityType).toBe("task");
    expect(notes[0]?.entityId).toBe("task-123");
    expect(connection.request).toHaveBeenCalledWith("note.list", {
      filter: expect.objectContaining({
        entityType: "task",
        entityId: "task-123",
      }),
    });
  });
});
