export type HabitId = string;

export interface HabitSummary {
  id: HabitId;
  title: string;
  projectId: string;
  projectName: string | null;
  schedule: string;
  timezone: string;
  startDate: string;
  endDate: string | null;
  nextDue: string;
  paused: boolean;
}

export interface HabitDetail extends HabitSummary {
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HabitStreak {
  current: number;
  longest: number;
  completedToday: boolean;
  totalCheckins: number;
}

export interface HabitCheckResult {
  habitId: HabitId;
  date: string;
  completed: boolean;
  streak: HabitStreak;
}

export interface HabitSummaryWithStreak extends HabitSummary {
  streak: HabitStreak | null;
}

export interface HabitFilter {
  paused?: boolean;
  projectId?: string;
  query?: string;
}
