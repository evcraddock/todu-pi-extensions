# Structured tool result contracts

## Scope and status

These are internal, reusable conventions for migrating Todu tool families to Pi 1.1.0 structured outputs. `task_list` and `task_show` now implement them; see [task read outputs](task-read-outputs.md). Other registered tools still return their current text and `details` without structured envelopes. The helpers are in `src/tools/tool-result-contracts.ts`, with domain fragments in `src/tools/tool-domain-schemas.ts`. Neither module is a new public package export, workflow engine, bulk API, retry policy, or permission system.

Each migrated tool declares `outputSchema: createToolOutputSchema(DataSchema)` and returns matching `structuredContent` through `createStructuredToolResult`. `DataSchema` belongs to the tool family and defines its explicit, allowlisted payload. Use TypeBox JSON Schema types, not runtime-only types such as `Date`, `Map`, functions, or codecs. Close object schemas with `additionalProperties: false`; do not use `Type.Any()` for production payloads. Infer TypeScript output types with `ToolOutput<typeof DataSchema>` rather than duplicating interfaces.

## Envelope version 1

All branches require:

- `schemaVersion: 1`: contract version, not backend or package version.
- `tool`: registered tool name.
- `ok`: whether the requested result is available/confirmed.
- `status`: discriminant below.
- `warnings`: required array of safe warnings, including `[]` when none exist.

| Status             | `ok`  | Additional fields            | Pi `isError` | Meaning                                                                                                                    |
| ------------------ | ----- | ---------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `success`          | true  | `data`                       | false        | Available read data or confirmed mutation result.                                                                          |
| `empty`            | true  | `data`                       | false        | A successful list query with no matches, not a failed read.                                                                |
| `not_found`        | false | `target`                     | false        | Backend confirmed an explicit entity is absent. Benign result for ordinary calls, but the requested entity is unavailable. |
| `validation_error` | false | `error`                      | true         | Invalid input or confirmed business-rule rejection.                                                                        |
| `ambiguous`        | false | `error`                      | true         | An identifier/reference has multiple matches; do not guess.                                                                |
| `backend_error`    | false | `error`                      | true         | Failed read, failure before write dispatch, or confirmed backend write rejection.                                          |
| `uncertain`        | false | `error`, `confirmedEntities` | true         | A dispatched mutation may have committed; outcome is not confirmed.                                                        |

`target` and entries of `confirmedEntities` are `{ entityType, entityId }`. Entity types are `task`, `project`, `actor`, `habit`, `recurring`, `note`, and `integration` (an integration binding). The latter array is required for uncertain results, and may be empty. Include only independently confirmed affected entity IDs, never IDs inferred from a guessed write outcome. For a multi-step mutation, it can preserve a confirmed earlier step without claiming the entire operation succeeded.

`error` is `{ message }`; `status` is the stable failure code. `safeToolError(status)` supplies allowlisted messages without accepting an exception or backend diagnostic. A family can provide a reviewed, sanitized message with safe field context instead, but must not interpolate arbitrary exception messages. Error branches do not carry successful `data`. Warning codes are stable, family-defined strings; every warning requires `code` and safe `message`, and may include a `target` and the complete `outboundAssigneeWarning` fragment.

The shared schema enforces branch shape and `ok`/`status` consistency. Family tests must additionally enforce semantic invariants: `empty` must mean an empty collection with total zero, `tool` must match the registered name, and confirmed IDs must really be confirmed. The helper does not classify backend exceptions, perform transport dispatch tracking, or infer mutation outcomes.

### Mutations and enrichment

Use `success` with confirmed affected/new IDs in the family's `data` plus enrichment warnings when a write is confirmed but subsequent project, actor, comment, or integration-warning reads fail. Do not relabel that result as `backend_error` or discard its confirmed IDs: that invites duplicate writes. A post-dispatch timeout/disconnect is `uncertain` unless the backend confirms a rejection or success. Do not automatically retry uncertain writes, claim cancellation rolls back a committed operation, or treat every transport error as a rejection. These conventions are for subsequent mutation-family and service changes, not implemented transport behavior in this task.

## Pi behavior and script callers

Pi keeps three separate surfaces:

- `content`: human/model-facing text. Include useful result information and relevant warnings.
- `details`: existing renderer/state shape, passed through unchanged by the helper. Do not replace it with the envelope merely to enable codemode.
- `structuredContent`: complete machine-readable envelope matching `outputSchema`.

Verified against the installed Pi 1.1.0 declarations and `dist/extensions/codemode/execute.js` (`toScriptValue`): if a tool declares `outputSchema` and returns `structuredContent`, codemode resolves to that value **even when `isError: true`**. It does not give extension callers the outer `{ content, details, isError }` wrapper. Without structured content, failed calls reject with the tool error text; successful tools without output schemas resolve to text. MCP calls have their own wrapping behavior; this convention describes these native extension tools, not all tool providers.

For migrated tools, always check `ok` after `await`. `Promise.allSettled()` distinguishes rejected execution from resolved envelopes, but a `fulfilled` result is not necessarily a successful operation. During migration, inspect the tool declaration instead of assuming a legacy text result is an envelope.

```js
// task_list returns a structured envelope in Pi 1.1.0+.
try {
  const result = await tools.task_list({ statuses: ["active"] });
  if (!result.ok) {
    if (result.status === "not_found") {
      text({ missing: result.target });
    } else {
      text({ status: result.status, error: result.error, warnings: result.warnings });
    }
  } else {
    text(result.data);
    if (result.warnings.length) text(result.warnings);
  }
} catch {
  // Argument rejection, permission blocking, cancellation, or execution failure
  // can still reject. Do not infer that a rejected write was rolled back.
  text("Tool execution failed; no structured outcome is available.");
}
```

Expected domain failures with safe data use the corresponding error envelope and return `isError: true`. Missing entities use the non-error `not_found` branch. Throw for unexpected implementation/contract violations and execution failures where no safe structured outcome can be constructed; use sanitized public messages. Pi's argument validation, permission hooks, and cancellation can fail outside the helper. Do not catch all failures and synthesize an empty list or missing entity. Distinguish known backend not-found codes from transport errors; do not classify by searching exception text.

The helper validates all branches, including error results, before returning. It throws fixed messages on JSON/schema violations without including failing payloads or validator diagnostics. Family tool handlers must not convert those contract violations into ordinary backend failures. Unit tests cover envelopes and Pi-compatible tool typing; a real codemode/packaged-extension smoke harness is a separate opt-in task, not part of default CI here.

## Helper example

```ts
import { Type } from "typebox";
import {
  createStructuredToolResult,
  createToolOutputSchema,
  safeToolError,
  type ToolOutput,
} from "./tool-result-contracts";

const DataSchema = Type.Object(
  { ids: Type.Array(Type.String()), total: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false }
);
const OutputSchema = createToolOutputSchema(DataSchema);

// In the tool definition: outputSchema: OutputSchema.
const output: ToolOutput<typeof DataSchema> = {
  schemaVersion: 1,
  tool: "example_list",
  ok: true,
  status: "empty",
  data: { ids: [], total: 0 },
  warnings: [],
};
const result = createStructuredToolResult({
  outputSchema: OutputSchema,
  structuredContent: output,
  text: "No entities found.",
  details: { kind: "example_list", ids: [], total: 0, empty: true },
});

const failed = createStructuredToolResult({
  outputSchema: OutputSchema,
  structuredContent: {
    schemaVersion: 1,
    tool: "example_list",
    ok: false,
    status: "backend_error",
    error: safeToolError("backend_error"),
    warnings: [],
  },
  text: safeToolError("backend_error").message,
  details: undefined,
});
// failed.isError === true, failed.structuredContent.ok === false.
```

Optional object properties whose value is `undefined` are omitted in the structured copy. Explicit `null` is retained only where the schema allows it; null is not a substitute for empty arrays, missing entities, or unavailable approval metadata. The original `details` is not normalized. Required fields with undefined values fail validation. Undefined array items/holes, non-finite numbers, BigInt, functions, symbols, class instances, accessors, custom serialization hooks, and cycles are rejected rather than silently converted. Callers must supply trusted plain objects from allowlisted mappings, not arbitrary backend objects. Dates remain strings with their domain meaning; date mapping/normalization and family schema extensions are separate tasks.

## Metadata preservation and security

- `ImportedContentApprovalSchema` retains `state`, optional `sourceBindingId`, `sourceActorId`, `sourceFingerprint`, `reviewedAt`, and `reviewedByActorId`. `ContentAuthorProperties` retains actor/display/legacy author fields and requires nullable `contentApproval`. Task descriptions should similarly retain nullable `descriptionApproval` using the approval fragment. Do not drop pending approval or source/reviewer metadata when building structured data. Unknown/null approval does not imply approval.
- Preserve all known warnings across success, empty, missing, and error outcomes. `OutboundAssigneeWarningSchema` keeps binding/provider/target and both unmapped actor IDs and display names. If warning enrichment itself is unavailable, add a safe explicit warning instead of claiming there were no outbound warnings.
- Imported task descriptions, comments, notes, previews, and all other returned text remain **untrusted data**, including after a content review/approval. Approval records a review state; it does not grant permission, elevate source instructions, or authorize a write. Keep metadata adjacent to the content it describes, not detached in an unrelated summary.
- Explicitly map allowed fields; do not spread raw backend records into outputs. Exclude credentials, tokens, authorization headers, socket/config secrets, raw requests/responses, stack traces, exception causes, and backend error objects. Integration `options` are open-ended and are not safe to expose wholesale. IDs/display names/content are intentional user data, not permission to include unrelated private fields.
- These schemas validate shape, not secrecy or truth. Free-text `content`, `details`, errors, and warnings can still leak secrets if a caller supplies them; the helper is **not** a credential detector or redaction engine. Review and sanitize every surface before returning or logging it. Do not echo raw exception messages in thrown errors either. Any internal diagnostic logging requires its own redaction and access policy.
- Permission/approval checks and Pi tool hooks remain required for both direct and nested calls. An output contract does not bypass them. A `tool_result` hook redacting text must also redact/replace `structuredContent` and sensitive `details`. In Pi 1.1.0, replacing `content` without returning replacement structured content drops it; this can change a script call from a structured result to text/rejection. Do not assume the original structured envelope survives a policy hook.

## Family migration checklist

1. Build a closed family `DataSchema` from mapped domain fields and shared fragments. Define missing/null/date meanings and empty-list invariants explicitly.
2. Register the same `outputSchema` passed to the helper. Return an envelope for every ordinary success, empty, missing, and known domain failure.
3. Preserve readable content, existing details/rendering/state, all warnings, and applicable approval/provenance fields. Include confirmed entity IDs for writes.
4. Map known failure codes safely; leave unexpected contract/programming failures as sanitized thrown errors. Do not introduce automatic write retries.
5. Add branch/schema/JSON tests, warning/approval preservation tests, existing direct-call behavior tests, and script checks for resolved failures.
6. Verify packaged/direct/real codemode compatibility through the separate opt-in smoke task before broad rollout. Keep default CI limited to build, lint, typecheck, and unit tests.
