import { describe, expect, it, vi } from "vitest";

import type { HabitDetail, HabitSummary, HabitSummaryWithStreak } from "@/domain/habit";
import { ToduDaemonClientError } from "@/services/todu/daemon-client";
import { createToduHabitService, ToduHabitServiceError } from "@/services/todu/todu-habit-service";

const createHabitSummary = (overrides: Partial<HabitSummary> = {}): HabitSummary => ({
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
  ...overrides,
});

const createHabitDetail = (overrides: Partial<HabitDetail> = {}): HabitDetail => ({
  ...createHabitSummary(),
  description: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

describe("createToduHabitService", () => {
  it("delegates habit reads and mutations to the daemon client", async () => {
    const habits = [createHabitSummary()];
    const createdHabit = createHabitDetail({ id: "habit-2", title: "Read daily" });
    const updatedHabit = createHabitDetail({ title: "Updated meditation" });
    const checkResult = {
      habitId: "habit-1",
      date: "2026-03-31",
      completed: true,
      streak: { current: 5, longest: 10, completedToday: true, totalCheckins: 25 },
    };
    const client = {
      listHabits: vi.fn().mockResolvedValue(habits),
      getHabit: vi.fn().mockResolvedValue(createdHabit),
      createHabit: vi.fn().mockResolvedValue(createdHabit),
      updateHabit: vi.fn().mockResolvedValue(updatedHabit),
      checkHabit: vi.fn().mockResolvedValue(checkResult),
      deleteHabit: vi.fn().mockResolvedValue({ habitId: "habit-1", deleted: true }),
      listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "Personal" }]),
      getProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Personal" }),
    };

    const service = createToduHabitService({ client: client as never });

    const listed = await service.listHabits();
    expect(listed[0]?.projectName).toBe("Personal");

    const fetched = await service.getHabit("habit-2");
    expect(fetched?.projectName).toBe("Personal");

    const created = await service.createHabit({
      title: "Read daily",
      projectId: "proj-1",
      schedule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-04-01",
    });
    expect(created.projectName).toBe("Personal");

    const updated = await service.updateHabit({ habitId: "habit-1", title: "Updated" });
    expect(updated.projectName).toBe("Personal");

    const checked = await service.checkHabit("habit-1");
    expect(checked.completed).toBe(true);

    const deleted = await service.deleteHabit("habit-1");
    expect(deleted.deleted).toBe(true);
  });

  it("returns null for a not-found habit", async () => {
    const client = {
      getHabit: vi.fn().mockResolvedValue(null),
      getProject: vi.fn(),
    };

    const service = createToduHabitService({ client: client as never });
    await expect(service.getHabit("missing")).resolves.toBeNull();
  });

  it("wraps daemon client errors in ToduHabitServiceError", async () => {
    const client = {
      listHabits: vi.fn().mockRejectedValue(
        new ToduDaemonClientError({
          code: "unavailable",
          method: "habit.list",
          message: "daemon unavailable",
        })
      ),
      listProjects: vi.fn(),
    };

    const service = createToduHabitService({ client: client as never });

    await expect(service.listHabits()).rejects.toThrow(ToduHabitServiceError);
    await expect(service.listHabits()).rejects.toMatchObject({
      operation: "listHabits",
      causeCode: "unavailable",
    });
  });

  it("returns habits with streaks from listHabitsWithStreaks", async () => {
    const habits = [createHabitSummary()];
    const streak = { current: 5, longest: 10, completedToday: true, totalCheckins: 25 };
    const client = {
      listHabits: vi.fn().mockResolvedValue(habits),
      listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "Personal" }]),
      getHabitStreak: vi.fn().mockResolvedValue(streak),
    };

    const service = createToduHabitService({ client: client as never });
    const result: HabitSummaryWithStreak[] = await service.listHabitsWithStreaks();

    expect(result[0]?.streak).toEqual(streak);
    expect(result[0]?.projectName).toBe("Personal");
  });

  it("sets streak to null when streak fetch fails", async () => {
    const habits = [createHabitSummary()];
    const client = {
      listHabits: vi.fn().mockResolvedValue(habits),
      listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "Personal" }]),
      getHabitStreak: vi.fn().mockRejectedValue(new Error("streak unavailable")),
    };

    const service = createToduHabitService({ client: client as never });
    const result: HabitSummaryWithStreak[] = await service.listHabitsWithStreaks();

    expect(result[0]?.streak).toBeNull();
    expect(result[0]?.title).toBe("Morning meditation");
  });
});
