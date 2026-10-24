import type { Static, TSchema } from "typebox";

import {
  createStructuredToolResult,
  createToolOutputSchema,
  safeToolError,
  type ToolErrorStatus,
  type ToolWarningSchema,
  type ToolOutput,
} from "./tool-result-contracts";
import type { EntityReferenceSchema } from "./tool-domain-schemas";
import { ToduDaemonClientError } from "../services/todu/daemon-client";
import { ToduNoteServiceError } from "../services/todu/todu-note-service";
import { ToduApprovalServiceError } from "../services/todu/todu-approval-service";
import { ToduProjectIntegrationServiceError } from "../services/todu/todu-project-integration-service";
import { ToduActorServiceError } from "../services/todu/todu-actor-service";

export type TrustToolWarning = Static<typeof ToolWarningSchema>;
type Target = Static<typeof EntityReferenceSchema>;
type FailureStatus = ToolErrorStatus | "not_found";

export class TrustToolInputError extends Error {
  constructor(readonly status: "validation_error" | "ambiguous" = "validation_error") {
    super(safeToolError(status).message);
  }
}

export const classifyTrustToolError = (options: {
  error: unknown;
  tool: string;
  dispatched?: boolean;
}): FailureStatus => {
  const { error, tool, dispatched = false } = options;
  if (error instanceof TrustToolInputError) return error.status;
  const known =
    error instanceof ToduDaemonClientError ||
    error instanceof ToduNoteServiceError ||
    error instanceof ToduApprovalServiceError ||
    error instanceof ToduProjectIntegrationServiceError ||
    error instanceof ToduActorServiceError;
  if (!known) {
    if (dispatched) return "uncertain";
    throw new Error(`${tool} failed: Unexpected operation failure.`);
  }
  const code = error instanceof ToduDaemonClientError ? error.code : error.causeCode;
  const requestState = "requestState" in error ? error.requestState : undefined;
  if (
    dispatched &&
    (requestState === "dispatched" ||
      (requestState === undefined &&
        ["timeout", "unavailable", "internal", "uncertain"].includes(code)))
  )
    return "uncertain";
  if (code === "not-found") return "not_found";
  if (code === "ambiguous") return "ambiguous";
  if (["validation", "conflict", "precondition-failed"].includes(code)) return "validation_error";
  if (["timeout", "unavailable", "internal", "uncertain"].includes(code)) return "backend_error";
  throw new Error(`${tool} failed: Unexpected operation failure.`);
};

export const createTrustResultBuilder = <TSchemaData extends TSchema>(
  dataSchema: TSchemaData,
  tool: string
) => {
  const outputSchema = createToolOutputSchema(dataSchema);
  return {
    outputSchema,
    success<TDetails>(options: {
      data: Static<TSchemaData>;
      details: TDetails;
      text: string;
      empty?: boolean;
      warnings?: TrustToolWarning[];
    }) {
      const warnings = options.warnings ?? [];
      // TypeBox cannot reduce its context-dependent Static type for an unresolved
      // generic. Callers' data is typed by Static<T>; the shared helper validates
      // this complete envelope against the actual schema before returning it.
      return createStructuredToolResult<TSchemaData, TDetails>({
        outputSchema,
        structuredContent: {
          schemaVersion: 1,
          tool,
          ok: true,
          status: options.empty ? "empty" : "success",
          data: options.data,
          warnings,
        } as unknown as ToolOutput<TSchemaData>,
        details: options.details,
        text: withWarnings(options.text, warnings),
      });
    },
    failure<TDetails = undefined>(options: {
      status: FailureStatus;
      target?: Target;
      details?: TDetails;
      text?: string;
      warnings?: TrustToolWarning[];
    }) {
      const { status, target, details, warnings = [] } = options;
      if (status === "not_found") {
        if (!target) throw new Error("Missing structured failure target.");
        return createStructuredToolResult<TSchemaData, TDetails | undefined>({
          outputSchema,
          structuredContent: { schemaVersion: 1, tool, ok: false, status, target, warnings },
          details,
          text: withWarnings(
            options.text ?? `${target.entityType} not found: ${target.entityId}`,
            warnings
          ),
        });
      }
      const error = safeToolError(status);
      return createStructuredToolResult<TSchemaData, TDetails | undefined>({
        outputSchema,
        structuredContent:
          status === "uncertain"
            ? { schemaVersion: 1, tool, ok: false, status, error, confirmedEntities: [], warnings }
            : { schemaVersion: 1, tool, ok: false, status, error, warnings },
        details,
        text: withWarnings(`${tool} failed: ${error.message}`, warnings),
      });
    },
  };
};

const withWarnings = (text: string, warnings: TrustToolWarning[]): string =>
  [text, ...warnings.map((warning) => `Warning (${warning.code}): ${warning.message}`)].join("\n");

export const projectTrustData = <T>(action: () => T): T => {
  try {
    return action();
  } catch {
    throw new Error("Invalid trust tool data.");
  }
};

export const optionalTrustRead = async <T>(options: {
  read: (() => Promise<T>) | undefined;
  fallback: T;
  warnings: TrustToolWarning[];
  code: string;
  message: string;
}): Promise<T> => {
  try {
    if (!options.read) throw new Error("Unavailable enrichment");
    return await options.read();
  } catch {
    options.warnings.push({ code: options.code, message: options.message });
    return options.fallback;
  }
};
