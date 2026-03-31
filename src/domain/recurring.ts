import type { TaskPriority } from "./task";

export type RecurringId = string;
export type RecurringMissPolicy = "accumulate" | "rollForward";

export interface RecurringTemplateSummary {
  id: RecurringId;
  title: string;
  projectId: string;
  projectName: string | null;
  priority: TaskPriority;
  schedule: string;
  timezone: string;
  startDate: string;
  endDate: string | null;
  nextDue: string;
  missPolicy: RecurringMissPolicy;
  paused: boolean;
}

export interface RecurringTemplateDetail extends RecurringTemplateSummary {
  description: string | null;
  labels: string[];
  skippedDates: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecurringFilter {
  paused?: boolean;
  projectId?: string;
  query?: string;
}
