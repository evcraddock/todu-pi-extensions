import type { JsonValue, TextContent } from "@earendil-works/pi-ai";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";

import { stringEnum } from "./string-enum";
import { EntityReferenceSchema, OutboundAssigneeWarningSchema } from "./tool-domain-schemas";

const ToolWarningSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
    target: Type.Optional(EntityReferenceSchema),
    outboundAssigneeWarning: Type.Optional(OutboundAssigneeWarningSchema),
  },
  { additionalProperties: false }
);

const SafeToolErrorSchema = Type.Object(
  { message: Type.String({ minLength: 1 }) },
  { additionalProperties: false }
);

const ERROR_MESSAGES = {
  validation_error: "Invalid input. Check the tool parameters.",
  ambiguous: "The input matches multiple entities. Specify an explicit ID.",
  backend_error: "The backend operation failed. No result is available.",
  uncertain:
    "The mutation outcome is unknown. Do not retry automatically; reconcile backend state first.",
} as const;

type ToolErrorStatus = keyof typeof ERROR_MESSAGES;

// Never accepts an Error or backend message: callers map known error codes, not raw diagnostics.
const safeToolError = (status: ToolErrorStatus): Static<typeof SafeToolErrorSchema> => ({
  message: ERROR_MESSAGES[status],
});

const createToolOutputSchema = <TDataSchema extends TSchema>(dataSchema: TDataSchema) => {
  const common = {
    schemaVersion: Type.Literal(1),
    tool: Type.String({ minLength: 1 }),
    warnings: Type.Array(ToolWarningSchema),
  };
  const closed = { additionalProperties: false };

  return Type.Union([
    Type.Object(
      {
        ...common,
        ok: Type.Literal(true),
        status: stringEnum(["success", "empty"] as const),
        data: dataSchema,
      },
      closed
    ),
    Type.Object(
      {
        ...common,
        ok: Type.Literal(false),
        status: Type.Literal("not_found"),
        target: EntityReferenceSchema,
      },
      closed
    ),
    Type.Object(
      {
        ...common,
        ok: Type.Literal(false),
        status: stringEnum(["validation_error", "ambiguous", "backend_error"] as const),
        error: SafeToolErrorSchema,
      },
      closed
    ),
    Type.Object(
      {
        ...common,
        ok: Type.Literal(false),
        status: Type.Literal("uncertain"),
        error: SafeToolErrorSchema,
        confirmedEntities: Type.Array(EntityReferenceSchema),
      },
      closed
    ),
  ]);
};

type ToolOutput<TDataSchema extends TSchema> = Static<
  ReturnType<typeof createToolOutputSchema<TDataSchema>>
>;

interface StructuredToolResultInput<TDataSchema extends TSchema, TDetails> {
  outputSchema: ReturnType<typeof createToolOutputSchema<TDataSchema>>;
  structuredContent: ToolOutput<TDataSchema>;
  text: string;
  details: TDetails;
}

interface StructuredToolResult<TDataSchema extends TSchema, TDetails> {
  content: TextContent[];
  details: TDetails;
  structuredContent: ToolOutput<TDataSchema> & JsonValue;
  isError: boolean;
}

const createStructuredToolResult = <TDataSchema extends TSchema, TDetails>({
  outputSchema,
  structuredContent,
  text,
  details,
}: StructuredToolResultInput<TDataSchema, TDetails>): StructuredToolResult<
  TDataSchema,
  TDetails
> => {
  const json = toJsonValue(structuredContent);
  if (!Value.Check(outputSchema, json)) {
    // Do not include validator diagnostics: they can echo private payloads.
    throw new Error("Structured tool result does not match outputSchema");
  }

  return {
    content: [{ type: "text", text }],
    details,
    structuredContent: json,
    isError: !json.ok && json.status !== "not_found",
  };
};

// JSON.stringify alone silently changes NaN, Dates, undefined array items, etc.
// Normalize only omitted object properties; reject all other lossy/non-JSON values.
const toJsonValue = (value: unknown, ancestors = new Set<object>()): JsonValue => {
  const fail = (): never => {
    throw new Error("Structured tool result must contain only JSON-compatible data");
  };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : fail();
  if (typeof value !== "object" || ancestors.has(value)) return fail();

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
  )
    return fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return fail();
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value")) return fail();
    if (isArray && key === "length") continue;
    if (!descriptor.enumerable) return fail();
    if (
      isArray &&
      (String(Number(key)) !== key ||
        !Number.isInteger(Number(key)) ||
        Number(key) < 0 ||
        Number(key) >= value.length)
    )
      return fail();
  }

  ancestors.add(value);
  try {
    if (isArray) {
      return Array.from({ length: value.length }, (_, index) =>
        toJsonValue(descriptors[index]?.value, ancestors)
      );
    }
    return Object.fromEntries(
      Object.entries(descriptors)
        .filter(([, descriptor]) => descriptor.value !== undefined)
        .map(([key, descriptor]) => [key, toJsonValue(descriptor.value, ancestors)])
    );
  } finally {
    ancestors.delete(value);
  }
};

export type { StructuredToolResult, StructuredToolResultInput, ToolErrorStatus, ToolOutput };
export {
  createStructuredToolResult,
  createToolOutputSchema,
  SafeToolErrorSchema,
  safeToolError,
  ToolWarningSchema,
};
