import { describe, expect, it, vi } from "vitest";

import { createToduDaemonClient } from "@/services/todu/daemon-client";
import type { ToduDaemonConnection } from "@/services/todu/daemon-connection";

const createConnectionMock = () => ({
  request: vi.fn(),
  subscribeToEvents: vi.fn(),
});

const createClient = (connection: ReturnType<typeof createConnectionMock>) =>
  createToduDaemonClient({
    connection: connection as unknown as Pick<
      ToduDaemonConnection,
      "request" | "subscribeToEvents"
    >,
  });

describe("createToduDaemonClient habit support", () => {
  it("lists habits through habit.list", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "habit-1",
          title: "Morning meditation",
          projectId: "proj-1",
          schedule: "FREQ=DAILY",
          timezone: "America/Chicago",
          startDate: "2026-03-01",
          nextDue: "2026-03-31",
          paused: false,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    });

    const client = createClient(connection);
    const habits = await client.listHabits({ query: "meditation" });

    expect(habits).toEqual([
      {
        id: "habit-1",
        title: "Morning meditation",
        projectId: "proj-1",
        projectName: null,
        schedule: "FREQ=DAILY",
        timezone: "America/Chicago",
        startDate: "2026-03-01",
        endDate: null,
        nextDue: "2026-03-31",
        paused: false,
      },
    ]);
    expect(connection.request).toHaveBeenCalledWith("habit.list", {
      filter: {
        paused: undefined,
        projectId: undefined,
        search: "meditation",
      },
    });
  });

  it("gets a habit by ID through habit.get", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "habit-1",
        title: "Morning meditation",
        description: "10 minutes",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "America/Chicago",
        startDate: "2026-03-01",
        nextDue: "2026-03-31",
        paused: false,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    });

    const client = createClient(connection);
    const habit = await client.getHabit("habit-1");

    expect(habit).toEqual({
      id: "habit-1",
      title: "Morning meditation",
      description: "10 minutes",
      projectId: "proj-1",
      projectName: null,
      schedule: "FREQ=DAILY",
      timezone: "America/Chicago",
      startDate: "2026-03-01",
      endDate: null,
      nextDue: "2026-03-31",
      paused: false,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(connection.request).toHaveBeenCalledWith("habit.get", { id: "habit-1" });
  });

  it("returns null for a not-found habit", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "Habit not found" },
    });

    const client = createClient(connection);
    await expect(client.getHabit("habit-missing")).resolves.toBeNull();
  });

  it("creates a habit through habit.create", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "habit-2",
        title: "Read 30 minutes",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-04-01",
        nextDue: "2026-04-01",
        paused: false,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    });

    const client = createClient(connection);
    const habit = await client.createHabit({
      title: "Read 30 minutes",
      projectId: "proj-1",
      schedule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-04-01",
    });

    expect(habit?.id).toBe("habit-2");
    expect(connection.request).toHaveBeenCalledWith("habit.create", {
      input: {
        title: "Read 30 minutes",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-04-01",
        description: undefined,
        endDate: undefined,
      },
    });
  });

  it("updates a habit through habit.update", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "habit-1",
        title: "Updated meditation",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "America/Chicago",
        startDate: "2026-03-01",
        nextDue: "2026-03-31",
        paused: false,
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
    });

    const client = createClient(connection);
    const habit = await client.updateHabit({
      habitId: "habit-1",
      title: "Updated meditation",
    });

    expect(habit?.title).toBe("Updated meditation");
    expect(connection.request).toHaveBeenCalledWith("habit.update", {
      id: "habit-1",
      input: {
        title: "Updated meditation",
        schedule: undefined,
        timezone: undefined,
        description: undefined,
        endDate: undefined,
      },
    });
  });

  it("checks a habit through habit.check", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        habit: {
          id: "habit-1",
          title: "Morning meditation",
          projectId: "proj-1",
          schedule: "FREQ=DAILY",
          timezone: "America/Chicago",
          startDate: "2026-03-01",
          nextDue: "2026-04-01",
          paused: false,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
        date: "2026-03-31",
        completed: true,
        streak: {
          current: 5,
          longest: 10,
          completedToday: true,
          totalCheckins: 25,
        },
      },
    });

    const client = createClient(connection);
    const result = await client.checkHabit("habit-1");

    expect(result).toEqual({
      habitId: "habit-1",
      date: "2026-03-31",
      completed: true,
      streak: {
        current: 5,
        longest: 10,
        completedToday: true,
        totalCheckins: 25,
      },
    });
    expect(connection.request).toHaveBeenCalledWith("habit.check", { id: "habit-1" });
  });

  it("checks a habit through habit.check when streak is missing", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        habit: {
          id: "habit-1",
          title: "Morning meditation",
          projectId: "proj-1",
          schedule: "FREQ=DAILY",
          timezone: "America/Chicago",
          startDate: "2026-03-01",
          nextDue: "2026-04-01",
          paused: false,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
        date: "2026-03-31",
        completed: true,
      },
    });

    const client = createClient(connection);
    const result = await client.checkHabit("habit-1");

    expect(result).toEqual({
      habitId: "habit-1",
      date: "2026-03-31",
      completed: true,
      streak: undefined,
    });
    expect(connection.request).toHaveBeenCalledWith("habit.check", { id: "habit-1" });
  });

  it("deletes a habit through habit.delete", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({ ok: true, value: null });

    const client = createClient(connection);
    const result = await client.deleteHabit("habit-1");

    expect(result).toEqual({ habitId: "habit-1", deleted: true });
    expect(connection.request).toHaveBeenCalledWith("habit.delete", { id: "habit-1" });
  });

  it("gets habit streak through habit.streak", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        current: 10,
        longest: 10,
        completedToday: true,
        totalCheckins: 17,
      },
    });

    const client = createClient(connection);
    const streak = await client.getHabitStreak("habit-1");

    expect(streak).toEqual({
      current: 10,
      longest: 10,
      completedToday: true,
      totalCheckins: 17,
    });
    expect(connection.request).toHaveBeenCalledWith("habit.streak", { id: "habit-1" });
  });

  it("throws a client error for daemon failures", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid schedule" },
    });

    const client = createClient(connection);
    await expect(
      client.createHabit({
        title: "Bad habit",
        projectId: "proj-1",
        schedule: "INVALID",
        timezone: "UTC",
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("habit.create failed");
  });

  it("creates a habit note via note.create with entityType habit", async () => {
    const connection = createConnectionMock();
    connection.request.mockResolvedValue({
      ok: true,
      value: {
        id: "note-1",
        content: "Session done",
        author: "user",
        entityType: "habit",
        entityId: "habit-1",
        tags: [],
        createdAt: "2026-03-31T00:00:00.000Z",
      },
    });

    const client = createClient(connection);
    const note = await client.addHabitNote({ habitId: "habit-1", content: "Session done" });

    expect(note).toEqual({
      id: "note-1",
      content: "Session done",
      authorActorId: null,
      authorDisplayName: "user",
      author: "user",
      contentApproval: null,
      entityType: "habit",
      entityId: "habit-1",
      tags: [],
      createdAt: "2026-03-31T00:00:00.000Z",
    });
    expect(connection.request).toHaveBeenCalledWith("note.create", {
      input: {
        content: "Session done",
        entityType: "habit",
        entityId: "habit-1",
      },
    });
  });
});
