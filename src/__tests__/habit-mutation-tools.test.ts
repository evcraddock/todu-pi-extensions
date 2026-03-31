import { describe, expect, it, vi } from "vitest";

import type { HabitDetail } from "@/domain/habit";
import type { HabitService } from "@/services/habit-service";
import type { ProjectService } from "@/services/project-service";
import { ToduHabitServiceError } from "@/services/todu/todu-habit-service";
import {
  createHabitCheckToolDefinition,
  createHabitCreateToolDefinition,
  createHabitDeleteToolDefinition,
  createHabitUpdateToolDefinition,
  normalizeCreateHabitInput,
  normalizeUpdateHabitInput,
} from "@/tools/habit-mutation-tools";

const createHabitDetail = (overrides: Partial<HabitDetail> = {}): HabitDetail => ({
  id: "habit-1",
  title: "Morning meditation",
  projectId: "proj-1",
  projectName: "Personal",
  schedule: "FREQ=DAILY",
  timezone: "America/Chicago",
  startDate: "2026-03-01",
  endDate: null,
  nextDue: "2026-03-31",
  paused: false,
  description: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  ...overrides,
});

const createProjectService = (): ProjectService =>
  ({
    getProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Personal" }),
    listProjects: vi.fn().mockResolvedValue([{ id: "proj-1", name: "Personal" }]),
  }) as unknown as ProjectService;

describe("normalizeCreateHabitInput", () => {
  it("normalizes valid input with schedule validation", () => {
    const input = normalizeCreateHabitInput({
      title: "Meditate",
      projectId: "proj-1",
      schedule: "freq=daily",
      timezone: "UTC",
      startDate: "2026-04-01",
    });

    expect(input.schedule).toBe("FREQ=DAILY");
  });

  it("rejects empty title", () => {
    expect(() =>
      normalizeCreateHabitInput({
        title: "  ",
        projectId: "proj-1",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-04-01",
      })
    ).toThrow("title is required");
  });

  it("rejects invalid schedule", () => {
    expect(() =>
      normalizeCreateHabitInput({
        title: "Bad",
        projectId: "proj-1",
        schedule: "NOT_A_RULE",
        timezone: "UTC",
        startDate: "2026-04-01",
      })
    ).toThrow();
  });
});

describe("normalizeUpdateHabitInput", () => {
  it("requires at least one field", () => {
    expect(() => normalizeUpdateHabitInput({ habitId: "habit-1" })).toThrow(
      "habit_update requires at least one supported field"
    );
  });

  it("normalizes schedule through shared validation", () => {
    const input = normalizeUpdateHabitInput({
      habitId: "habit-1",
      schedule: "freq=weekly;byday=mo,we,fr",
    });

    expect(input.schedule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });

  it("clears description with empty string", () => {
    const input = normalizeUpdateHabitInput({
      habitId: "habit-1",
      description: "",
    });

    expect(input.description).toBeNull();
  });
});

describe("createHabitCreateToolDefinition", () => {
  it("creates a habit and returns structured details", async () => {
    const habit = createHabitDetail({ id: "habit-2", title: "Read daily" });
    const habitService = {
      createHabit: vi.fn().mockResolvedValue(habit),
    } as unknown as HabitService;
    const projectService = createProjectService();

    const tool = createHabitCreateToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tc-1", {
      title: "Read daily",
      projectId: "Personal",
      schedule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-04-01",
    });

    expect(result.content[0]?.text).toContain("Created habit habit-2");
    expect(result.details).toMatchObject({ kind: "habit_create" });
  });

  it("resolves project by name", async () => {
    const habit = createHabitDetail();
    const habitService = {
      createHabit: vi.fn().mockResolvedValue(habit),
    } as unknown as HabitService;
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi
        .fn()
        .mockResolvedValue([
          { id: "proj-1", name: "Personal", status: "active", priority: "medium" },
        ]),
    } as unknown as ProjectService;

    const tool = createHabitCreateToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    const result = await tool.execute("tc-1", {
      title: "Meditate",
      projectId: "Personal",
      schedule: "FREQ=DAILY",
      timezone: "UTC",
      startDate: "2026-04-01",
    });

    expect(result.details).toMatchObject({ kind: "habit_create" });
    expect(habitService.createHabit).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1" })
    );
  });

  it("throws when project is not found", async () => {
    const habitService = {} as unknown as HabitService;
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as ProjectService;

    const tool = createHabitCreateToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn().mockResolvedValue(projectService),
    });

    await expect(
      tool.execute("tc-1", {
        title: "Meditate",
        projectId: "NonExistent",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("project not found");
  });
});

describe("createHabitUpdateToolDefinition", () => {
  it("updates a habit and returns changed fields", async () => {
    const habit = createHabitDetail({ title: "Updated meditation" });
    const habitService = {
      updateHabit: vi.fn().mockResolvedValue(habit),
    } as unknown as HabitService;

    const tool = createHabitUpdateToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn(),
    });

    const result = await tool.execute("tc-1", {
      habitId: "habit-1",
      title: "Updated meditation",
    });

    expect(result.content[0]?.text).toContain("Updated habit habit-1");
    expect(result.content[0]?.text).toContain('title="Updated meditation"');
    expect(result.details).toMatchObject({ kind: "habit_update" });
  });
});

describe("createHabitCheckToolDefinition", () => {
  it("checks a habit and returns streak details", async () => {
    const checkResult = {
      habitId: "habit-1",
      date: "2026-03-31",
      completed: true,
      streak: { current: 5, longest: 10, completedToday: true, totalCheckins: 25 },
    };
    const habitService = {
      checkHabit: vi.fn().mockResolvedValue(checkResult),
    } as unknown as HabitService;

    const tool = createHabitCheckToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn(),
    });

    const result = await tool.execute("tc-1", { habitId: "habit-1" });

    expect(result.content[0]?.text).toContain("checked in");
    expect(result.content[0]?.text).toContain("Streak: 5 current");
    expect(result.details).toMatchObject({ kind: "habit_check", found: true });
  });

  it("returns not-found when habit does not exist", async () => {
    const habitService = {
      checkHabit: vi.fn().mockRejectedValue(
        new ToduHabitServiceError({
          operation: "checkHabit",
          causeCode: "not-found",
          message: "checkHabit failed",
        })
      ),
    } as unknown as HabitService;

    const tool = createHabitCheckToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn(),
    });

    const result = await tool.execute("tc-1", { habitId: "habit-missing" });

    expect(result.content[0]?.text).toContain("Habit not found");
    expect(result.details).toMatchObject({ kind: "habit_check", found: false });
  });

  it("rejects empty habitId", async () => {
    const tool = createHabitCheckToolDefinition({
      getHabitService: vi.fn(),
      getProjectService: vi.fn(),
    });

    await expect(tool.execute("tc-1", { habitId: "  " })).rejects.toThrow("habitId is required");
  });
});

describe("createHabitDeleteToolDefinition", () => {
  it("deletes a habit and returns structured details", async () => {
    const habitService = {
      deleteHabit: vi.fn().mockResolvedValue({ habitId: "habit-1", deleted: true }),
    } as unknown as HabitService;

    const tool = createHabitDeleteToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn(),
    });

    const result = await tool.execute("tc-1", { habitId: "habit-1" });

    expect(result.content[0]?.text).toContain("Deleted habit habit-1");
    expect(result.details).toMatchObject({ kind: "habit_delete", found: true, deleted: true });
  });

  it("returns not-found when habit does not exist", async () => {
    const habitService = {
      deleteHabit: vi.fn().mockRejectedValue(
        new ToduHabitServiceError({
          operation: "deleteHabit",
          causeCode: "not-found",
          message: "deleteHabit failed",
        })
      ),
    } as unknown as HabitService;

    const tool = createHabitDeleteToolDefinition({
      getHabitService: vi.fn().mockResolvedValue(habitService),
      getProjectService: vi.fn(),
    });

    const result = await tool.execute("tc-1", { habitId: "habit-missing" });

    expect(result.content[0]?.text).toContain("Habit not found");
    expect(result.details).toMatchObject({ kind: "habit_delete", found: false, deleted: false });
  });
});
