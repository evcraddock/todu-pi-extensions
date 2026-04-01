import type {
  HabitCheckResult,
  HabitDetail,
  HabitFilter,
  HabitId,
  HabitStreak,
  HabitSummary,
  HabitSummaryWithStreak,
} from "../domain/habit";
import type { NoteSummary } from "../domain/note";

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

export interface AddHabitNoteInput {
  habitId: HabitId;
  content: string;
}

export interface HabitService {
  listHabits(filter?: HabitFilter): Promise<HabitSummary[]>;
  listHabitsWithStreaks(filter?: HabitFilter): Promise<HabitSummaryWithStreak[]>;
  getHabitStreak(habitId: HabitId): Promise<HabitStreak>;
  getHabit(habitId: HabitId): Promise<HabitDetail | null>;
  createHabit(input: CreateHabitInput): Promise<HabitDetail>;
  updateHabit(input: UpdateHabitInput): Promise<HabitDetail>;
  checkHabit(habitId: HabitId): Promise<HabitCheckResult>;
  deleteHabit(habitId: HabitId): Promise<DeleteHabitResult>;
  addHabitNote(input: AddHabitNoteInput): Promise<NoteSummary>;
}
