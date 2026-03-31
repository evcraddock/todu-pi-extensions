import { describe, expect, it } from "vitest";

import {
  createScheduleValidationIssue,
  normalizeSchedulePartValue,
  parseScheduleRuleParts,
  validateAndNormalizeScheduleRule,
} from "@/utils/schedule";

describe("normalizeSchedulePartValue", () => {
  it("uppercases FREQ and WKST values", () => {
    expect(normalizeSchedulePartValue("FREQ", "daily")).toBe("DAILY");
    expect(normalizeSchedulePartValue("WKST", "su")).toBe("SU");
  });

  it("normalizes BYDAY lists", () => {
    expect(normalizeSchedulePartValue("BYDAY", "mo, we,fr")).toBe("MO,WE,FR");
  });

  it("preserves non-uppercase values", () => {
    expect(normalizeSchedulePartValue("INTERVAL", "2")).toBe("2");
    expect(normalizeSchedulePartValue("BYMONTHDAY", "-1")).toBe("-1");
  });
});

describe("parseScheduleRuleParts", () => {
  it("parses and sorts entries with FREQ first", () => {
    const result = parseScheduleRuleParts("byday=mo,we,fr; interval=2; freq=weekly");

    expect(result).toEqual({
      ok: true,
      value: {
        entries: [
          ["FREQ", "WEEKLY"],
          ["BYDAY", "MO,WE,FR"],
          ["INTERVAL", "2"],
        ],
      },
    });
  });

  it("rejects duplicate keys", () => {
    expect(parseScheduleRuleParts("FREQ=DAILY;FREQ=WEEKLY")).toEqual({
      ok: false,
      error: createScheduleValidationIssue(
        "invalid-rrule",
        "Duplicate RRULE part is not supported: FREQ"
      ),
    });
  });

  it("rejects malformed parts", () => {
    expect(parseScheduleRuleParts("FREQ=DAILY;BYDAY")).toEqual({
      ok: false,
      error: createScheduleValidationIssue("invalid-rrule", "Invalid RRULE part: BYDAY"),
    });
  });

  it("rejects blank input", () => {
    expect(parseScheduleRuleParts("   ")).toEqual({
      ok: false,
      error: createScheduleValidationIssue("invalid-rrule", "RRULE is required"),
    });
  });
});

describe("validateAndNormalizeScheduleRule", () => {
  it("normalizes casing, whitespace, and part ordering", () => {
    const result = validateAndNormalizeScheduleRule(" byday=mo,we,fr ; interval=2 ; freq=weekly ");

    expect(result).toEqual({
      ok: true,
      value: {
        rule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2",
        parts: {
          FREQ: "WEEKLY",
          BYDAY: "MO,WE,FR",
          INTERVAL: "2",
        },
        changed: true,
      },
    });
  });

  it("returns unchanged false for canonical input", () => {
    const result = validateAndNormalizeScheduleRule("FREQ=DAILY;INTERVAL=1");

    expect(result).toEqual({
      ok: true,
      value: {
        rule: "FREQ=DAILY;INTERVAL=1",
        parts: {
          FREQ: "DAILY",
          INTERVAL: "1",
        },
        changed: false,
      },
    });
  });

  it("maps unsupported sub-daily rules explicitly", () => {
    const result = validateAndNormalizeScheduleRule("FREQ=HOURLY");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid result");
    }

    expect(result.error.code).toBe("unsupported-rrule");
    expect(result.error.field).toBe("schedule");
    expect(result.error.message).toContain("Sub-daily");
    expect(result.error.cause?.type).toBe("validation");
  });

  it("maps invalid rules explicitly", () => {
    const result = validateAndNormalizeScheduleRule("INTERVAL=2");

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid result");
    }

    expect(result.error.code).toBe("invalid-rrule");
    expect(result.error.field).toBe("schedule");
    expect(result.error.message).toContain("FREQ");
  });
});
