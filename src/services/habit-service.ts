import type {
  HabitCheckResult,
  HabitDetail,
  HabitFilter,
  HabitId,
  HabitSummary,
} from "../domain/habit";

export interface CreateHabitInput {
  title: string;
  projectId: string;
  schedule: string;
  timezone: string;
  startDate: string;
  description?: string | null;
  endDate?: string | null;
}

export interface UpdateHabitInput {
  habitId: HabitId;
  title?: string;
  schedule?: string;
  timezone?: string;
  description?: string | null;
  endDate?: string | null;
}

export interface DeleteHabitResult {
  habitId: HabitId;
  deleted: true;
}

export interface HabitService {
  listHabits(filter?: HabitFilter): Promise<HabitSummary[]>;
  getHabit(habitId: HabitId): Promise<HabitDetail | null>;
  createHabit(input: CreateHabitInput): Promise<HabitDetail>;
  updateHabit(input: UpdateHabitInput): Promise<HabitDetail>;
  checkHabit(habitId: HabitId): Promise<HabitCheckResult>;
  deleteHabit(habitId: HabitId): Promise<DeleteHabitResult>;
}
