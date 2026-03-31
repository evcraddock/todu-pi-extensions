import { describe, expect, it, vi } from "vitest";

import { createToduDaemonClient } from "@/services/todu/daemon-client";
import type { ToduDaemonConnection } from "@/services/todu/daemon-connection";

const createConnectionMock = () => ({
  request: vi.fn(),
  subscribeToEvents: vi.fn(),
});

describe("createToduDaemonClient recurring support", () => {
  it("lists recurring templates through recurring.list", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "rec-1",
          title: "Weekly review",
          projectId: "proj-1",
          labels: ["review"],
          priority: "high",
          schedule: "FREQ=WEEKLY;BYDAY=FR",
          timezone: "UTC",
          startDate: "2026-03-01",
          nextDue: "2026-03-06",
          skippedDates: [],
          paused: false,
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

    await expect(client.listRecurring({ projectId: "proj-1", query: "review" })).resolves.toEqual([
      {
        id: "rec-1",
        title: "Weekly review",
        projectId: "proj-1",
        projectName: null,
        priority: "high",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
        endDate: null,
        nextDue: "2026-03-06",
        missPolicy: "accumulate",
        paused: false,
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("recurring.list", {
      filter: {
        paused: undefined,
        projectId: "proj-1",
        search: "review",
      },
    });
  });

  it("hydrates recurring template detail through recurring.get", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "rec-1",
        title: "Weekly review",
        description: "End of week review",
        projectId: "proj-1",
        labels: ["review"],
        priority: "high",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
        endDate: "2026-12-31",
        nextDue: "2026-03-06",
        missPolicy: "rollForward",
        skippedDates: ["2026-03-13"],
        paused: true,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
    });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.getRecurring("rec-1")).resolves.toEqual({
      id: "rec-1",
      title: "Weekly review",
      description: "End of week review",
      projectId: "proj-1",
      projectName: null,
      labels: ["review"],
      priority: "high",
      schedule: "FREQ=WEEKLY;BYDAY=FR",
      timezone: "UTC",
      startDate: "2026-03-01",
      endDate: "2026-12-31",
      nextDue: "2026-03-06",
      missPolicy: "rollForward",
      skippedDates: ["2026-03-13"],
      paused: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });
    expect(connection.request).toHaveBeenCalledWith("recurring.get", { id: "rec-1" });
  });

  it("creates, updates, and deletes recurring templates through daemon methods", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "rec-1",
          title: "Weekly review",
          projectId: "proj-1",
          labels: [],
          priority: "medium",
          schedule: "FREQ=WEEKLY;BYDAY=FR",
          timezone: "UTC",
          startDate: "2026-03-01",
          nextDue: "2026-03-06",
          skippedDates: [],
          paused: false,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "rec-1",
          title: "Updated review",
          projectId: "proj-1",
          labels: [],
          priority: "high",
          schedule: "FREQ=DAILY",
          timezone: "UTC",
          startDate: "2026-03-01",
          nextDue: "2026-03-02",
          skippedDates: [],
          paused: true,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({ ok: true, value: null });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(
      client.createRecurring({
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "rec-1",
        title: "Weekly review",
      })
    );
    expect(connection.request).toHaveBeenNthCalledWith(1, "recurring.create", {
      input: {
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
        description: undefined,
        priority: undefined,
        endDate: undefined,
        missPolicy: undefined,
      },
    });

    await expect(
      client.updateRecurring({
        recurringId: "rec-1",
        schedule: "FREQ=DAILY",
        paused: true,
        priority: "high",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "rec-1",
        title: "Updated review",
      })
    );
    expect(connection.request).toHaveBeenNthCalledWith(2, "recurring.update", {
      id: "rec-1",
      input: {
        title: undefined,
        projectId: undefined,
        schedule: "FREQ=DAILY",
        timezone: undefined,
        startDate: undefined,
        description: undefined,
        priority: "high",
        endDate: undefined,
        missPolicy: undefined,
        paused: true,
      },
    });

    await expect(client.deleteRecurring("rec-1")).resolves.toEqual({
      recurringId: "rec-1",
      deleted: true,
    });
    expect(connection.request).toHaveBeenNthCalledWith(3, "recurring.delete", { id: "rec-1" });
  });

  it("maps recurring daemon failures into client errors", async () => {
    const connection = createConnectionMock();
    connection.request
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "invalid recurring filter",
          details: { field: "search" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "recurring template not found",
          details: { id: "rec-missing" },
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "CONFLICT",
          message: "duplicate recurring template",
          details: { title: "Weekly review" },
        },
      });

    const client = createToduDaemonClient({
      connection: connection as unknown as Pick<
        ToduDaemonConnection,
        "request" | "subscribeToEvents"
      >,
    });

    await expect(client.listRecurring()).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "validation",
        method: "recurring.list",
        message: "recurring.list failed (VALIDATION_ERROR): invalid recurring filter",
      })
    );
    await expect(client.getRecurring("rec-missing")).resolves.toBeNull();
    await expect(
      client.createRecurring({
        title: "Weekly review",
        projectId: "proj-1",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-03-01",
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ToduDaemonClientError",
        code: "conflict",
        method: "recurring.create",
        message: "recurring.create failed (CONFLICT): duplicate recurring template",
      })
    );
  });
});
