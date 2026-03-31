import type {
  RecurringFilter,
  RecurringId,
  RecurringMissPolicy,
  RecurringTemplateDetail,
  RecurringTemplateSummary,
} from "../domain/recurring";
import type { TaskPriority } from "../domain/task";

export interface CreateRecurringInput {
  title: string;
  projectId: string;
  schedule: string;
  timezone: string;
  startDate: string;
  description?: string | null;
  priority?: TaskPriority;
  endDate?: string | null;
  missPolicy?: RecurringMissPolicy;
}

export interface UpdateRecurringInput {
  recurringId: RecurringId;
  title?: string;
  projectId?: string;
  schedule?: string;
  timezone?: string;
  startDate?: string;
  description?: string | null;
  priority?: TaskPriority;
  endDate?: string | null;
  missPolicy?: RecurringMissPolicy;
  paused?: boolean;
}

export interface DeleteRecurringResult {
  recurringId: RecurringId;
  deleted: true;
}

export interface RecurringService {
  listRecurring(filter?: RecurringFilter): Promise<RecurringTemplateSummary[]>;
  getRecurring(recurringId: RecurringId): Promise<RecurringTemplateDetail | null>;
  createRecurring(input: CreateRecurringInput): Promise<RecurringTemplateDetail>;
  updateRecurring(input: UpdateRecurringInput): Promise<RecurringTemplateDetail>;
  deleteRecurring(recurringId: RecurringId): Promise<DeleteRecurringResult>;
}
