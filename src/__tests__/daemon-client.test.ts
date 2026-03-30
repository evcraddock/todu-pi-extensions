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
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("task.list", {
      filter: {
        projectId: undefined,
        priority: undefined,
        status: "canceled",
      },
    });
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
      description: "Implement the typed client wrapper",
      comments: [
        {
          id: "note-1",
          taskId: "task-1",
          content: "First note",
          author: "user",
          createdAt: "2026-03-19T01:00:00.000Z",
        },
      ],
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
      author: "user",
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
});
