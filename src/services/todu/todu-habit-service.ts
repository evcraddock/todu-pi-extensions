import type {
  HabitDetail,
  HabitFilter,
  HabitSummary,
  HabitSummaryWithStreak,
} from "../../domain/habit";
import type { HabitService } from "../habit-service";
import { ToduDaemonClientError, type ToduDaemonClient } from "./daemon-client";

export class ToduHabitServiceError extends Error {
  readonly operation: string;
  readonly causeCode: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    operation: string;
    causeCode: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ToduHabitServiceError";
    this.operation = options.operation;
    this.causeCode = options.causeCode;
    this.details = options.details;
  }
}

export interface ToduHabitServiceDependencies {
  client: ToduDaemonClient;
}

const createToduHabitService = ({ client }: ToduHabitServiceDependencies): HabitService => ({
  listHabits: (filter) =>
    runHabitServiceOperation("listHabits", () => listHabitsWithProjectNames(client, filter)),
  getHabit: (habitId) =>
    runHabitServiceOperation("getHabit", async () => {
      const habit = await client.getHabit(habitId);
      if (!habit) {
        return null;
      }

      return hydrateHabitProjectName(client, habit);
    }),
  createHabit: (input) =>
    runHabitServiceOperation("createHabit", async () => {
      const habit = await client.createHabit(input);
      return hydrateHabitProjectName(client, habit);
    }),
  updateHabit: (input) =>
    runHabitServiceOperation("updateHabit", async () => {
      const habit = await client.updateHabit(input);
      return hydrateHabitProjectName(client, habit);
    }),
  listHabitsWithStreaks: (filter) =>
    runHabitServiceOperation("listHabitsWithStreaks", () => listHabitsWithStreaks(client, filter)),
  getHabitStreak: (habitId) =>
    runHabitServiceOperation("getHabitStreak", () => client.getHabitStreak(habitId)),
  checkHabit: (habitId) => runHabitServiceOperation("checkHabit", () => client.checkHabit(habitId)),
  deleteHabit: (habitId) =>
    runHabitServiceOperation("deleteHabit", () => client.deleteHabit(habitId)),
});

const listHabitsWithProjectNames = async (
  client: ToduDaemonClient,
  filter?: HabitFilter
): Promise<HabitSummary[]> => {
  const [habits, projects] = await Promise.all([client.listHabits(filter), client.listProjects()]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  return habits.map((habit) => ({
    ...habit,
    projectName: projectNames.get(habit.projectId) ?? null,
  }));
};

const hydrateHabitProjectName = async (
  client: ToduDaemonClient,
  habit: HabitDetail
): Promise<HabitDetail> => {
  const project = await client.getProject(habit.projectId);
  return {
    ...habit,
    projectName: project?.name ?? null,
  };
};

const runHabitServiceOperation = async <TResult>(
  operation: string,
  action: () => Promise<TResult>
): Promise<TResult> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ToduDaemonClientError) {
      throw new ToduHabitServiceError({
        operation,
        causeCode: error.code,
        message: `${operation} failed: ${error.message}`,
        details: error.details,
        cause: error,
      });
    }

    throw error;
  }
};

const listHabitsWithStreaks = async (
  client: ToduDaemonClient,
  filter?: HabitFilter
): Promise<HabitSummaryWithStreak[]> => {
  const habits = await listHabitsWithProjectNames(client, filter);
  const streakResults = await Promise.allSettled(
    habits.map((habit) => client.getHabitStreak(habit.id))
  );

  return habits.map((habit, index) => {
    const streakResult = streakResults[index];
    return {
      ...habit,
      streak: streakResult?.status === "fulfilled" ? streakResult.value : null,
    };
  });
};

export {
  createToduHabitService,
  hydrateHabitProjectName,
  listHabitsWithProjectNames,
  listHabitsWithStreaks,
  runHabitServiceOperation,
};
