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
