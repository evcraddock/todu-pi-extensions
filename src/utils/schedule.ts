import { type ValidationError, validateRRule } from "@todu/core";

const FREQ_FIRST_PART = "FREQ";
const UPPERCASE_VALUE_KEYS = new Set(["FREQ", "BYDAY", "WKST"]);

export type ScheduleValidationCode = "invalid-rrule" | "unsupported-rrule";

export interface NormalizedScheduleRule {
  rule: string;
  parts: Readonly<Record<string, string>>;
  changed: boolean;
}

export interface ScheduleValidationIssue {
  code: ScheduleValidationCode;
  field: "schedule";
  message: string;
  cause?: ValidationError;
}

export type NormalizeScheduleRuleResult =
  | {
      ok: true;
      value: NormalizedScheduleRule;
    }
  | {
      ok: false;
      error: ScheduleValidationIssue;
    };

const validateAndNormalizeScheduleRule = (rule: string): NormalizeScheduleRuleResult => {
  const parseResult = parseScheduleRuleParts(rule);
  if (!parseResult.ok) {
    return parseResult;
  }

  const normalizedRule = formatNormalizedRule(parseResult.value.entries);
  const validationError = validateRRule(normalizedRule);
  if (validationError) {
    return {
      ok: false,
      error: mapScheduleValidationError(validationError),
    };
  }

  return {
    ok: true,
    value: {
      rule: normalizedRule,
      parts: Object.freeze(Object.fromEntries(parseResult.value.entries)),
      changed: normalizedRule !== rule.trim(),
    },
  };
};

const parseScheduleRuleParts = (
  rule: string
):
  | {
      ok: true;
      value: {
        entries: Array<[string, string]>;
      };
    }
  | {
      ok: false;
      error: ScheduleValidationIssue;
    } => {
  const trimmedRule = rule.trim();
  if (trimmedRule.length === 0) {
    return {
      ok: false,
      error: createScheduleValidationIssue("invalid-rrule", "RRULE is required"),
    };
  }

  const entries = new Map<string, string>();
  for (const rawPart of trimmedRule.split(";")) {
    const trimmedPart = rawPart.trim();
    if (trimmedPart.length === 0) {
      return {
        ok: false,
        error: createScheduleValidationIssue("invalid-rrule", "Invalid RRULE part: empty part"),
      };
    }

    const separatorIndex = trimmedPart.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === trimmedPart.length - 1) {
      return {
        ok: false,
        error: createScheduleValidationIssue("invalid-rrule", `Invalid RRULE part: ${trimmedPart}`),
      };
    }

    const key = trimmedPart.slice(0, separatorIndex).trim().toUpperCase();
    const rawValue = trimmedPart.slice(separatorIndex + 1).trim();
    if (key.length === 0 || rawValue.length === 0) {
      return {
        ok: false,
        error: createScheduleValidationIssue("invalid-rrule", `Invalid RRULE part: ${trimmedPart}`),
      };
    }

    if (entries.has(key)) {
      return {
        ok: false,
        error: createScheduleValidationIssue(
          "invalid-rrule",
          `Duplicate RRULE part is not supported: ${key}`
        ),
      };
    }

    entries.set(key, normalizeSchedulePartValue(key, rawValue));
  }

  return {
    ok: true,
    value: {
      entries: [...entries.entries()].sort(compareScheduleEntries),
    },
  };
};

const normalizeSchedulePartValue = (key: string, value: string): string => {
  if (key === "BYDAY") {
    return value
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter((entry) => entry.length > 0)
      .join(",");
  }

  if (UPPERCASE_VALUE_KEYS.has(key)) {
    return value.toUpperCase();
  }

  return value;
};

const compareScheduleEntries = (left: [string, string], right: [string, string]): number => {
  if (left[0] === right[0]) {
    return 0;
  }

  if (left[0] === FREQ_FIRST_PART) {
    return -1;
  }

  if (right[0] === FREQ_FIRST_PART) {
    return 1;
  }

  return left[0].localeCompare(right[0]);
};

const formatNormalizedRule = (entries: ReadonlyArray<readonly [string, string]>): string =>
  entries.map(([key, value]) => `${key}=${value}`).join(";");

const mapScheduleValidationError = (error: ValidationError): ScheduleValidationIssue => ({
  code: error.message.includes("not supported") ? "unsupported-rrule" : "invalid-rrule",
  field: "schedule",
  message: error.message,
  cause: error,
});

const createScheduleValidationIssue = (
  code: ScheduleValidationCode,
  message: string,
  cause?: ValidationError
): ScheduleValidationIssue => ({
  code,
  field: "schedule",
  message,
  cause,
});

export {
  createScheduleValidationIssue,
  formatNormalizedRule,
  mapScheduleValidationError,
  normalizeSchedulePartValue,
  parseScheduleRuleParts,
  validateAndNormalizeScheduleRule,
};
