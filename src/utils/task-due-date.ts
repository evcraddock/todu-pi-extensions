const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const INVALID_DUE_DATE =
  "dueDate must be a valid, unambiguous calendar date. Use YYYY-MM-DD, November 1, 2026, or 1 Nov 2026 with a four-digit year. Relative dates, numeric slash dates, and timestamps are not supported; clarify them before updating.";

/** Normalize explicit calendar dates without guessing locale, year, time, or timezone. */
export const normalizeTaskDueDate = (value: string): string => {
  if (typeof value !== "string") throw new Error(INVALID_DUE_DATE);

  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const monthFirst = /^([a-z]+) (\d{1,2}),? (\d{4})$/.exec(text);
  const dayFirst = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(text);
  const named = monthFirst ?? dayFirst;
  if (!iso && !named) throw new Error(INVALID_DUE_DATE);

  const monthName = monthFirst?.[1] ?? dayFirst?.[2];
  const year = Number(iso?.[1] ?? named?.[3]);
  const month = iso
    ? Number(iso[2])
    : MONTH_NAMES.findIndex((name) => name === monthName || name.slice(0, 3) === monthName) + 1;
  const day = Number(iso?.[3] ?? monthFirst?.[2] ?? dayFirst?.[1]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)) {
    throw new Error(INVALID_DUE_DATE);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
