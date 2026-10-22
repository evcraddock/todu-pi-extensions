import { validateISODate } from "@todu/core";

/** Validate mutation input without converting calendar dates or timestamp offsets. */
export const normalizeTaskScheduledDate = (value: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("scheduledDate must be a non-empty date string");
  }

  const scheduledDate = value.trim();
  if (validateISODate("scheduledDate", scheduledDate)) {
    throw new Error("scheduledDate must be a valid date (YYYY-MM-DD or ISO timestamp)");
  }

  return scheduledDate;
};

/** Clearing is explicit and distinct from omitting a mutation field. */
export const normalizeTaskScheduledDateUpdate = (value: string | null): string | null => {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return null;
  }
  return normalizeTaskScheduledDate(value);
};
