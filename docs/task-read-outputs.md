# Structured task reads

`task_list` and `task_show` declare `outputSchema` and return validated `structuredContent` using the [version 1 shared envelope](tool-result-contracts.md). Pi 1.1.0+ codemode resolves these calls to the envelope, not readable text or the outer tool result. Other Todu tool families have not migrated; do not assume they return envelopes.

## Payloads

| Tool / status             | Payload                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `task_list` / `success`   | `data: { filter, tasks, total, empty: false }`                        |
| `task_list` / `empty`     | `data: { filter, tasks: [], total: 0, empty: true }`                  |
| `task_show` / `success`   | `data: { taskId, found: true, task }`                                 |
| `task_show` / `not_found` | `target: { entityType: "task", entityId: <requested ID> }`, no `data` |

`total` is the returned collection length, not a count across other queries or pages. `filter` records the actual normalized filter passed to the service: statuses, priorities, projectId, query, from, to, updatedFrom, updatedTo, label, overdue, today, sort, sortDirection, and timezone. Blank optional text and empty status/priority arrays are omitted from structured JSON. False booleans are retained. Timezone is always populated, using the explicit value or detected system timezone. This normalization is not a new workflow/filter policy.

Each task summary explicitly maps `id`, `title`, `status`, `priority`, nullable `projectId`/`projectName`, `labels`, `assigneeActorIds`, `assigneeDisplayNames`, legacy `assignees`, and the four [task date fields](task-dates.md): nullable `dueDate`/`scheduledDate` and required `createdAt`/`updatedAt` strings. Dates retain the exact backend representation; no timezone conversion or invented timestamp occurs. The schemas validate types, not historical date formats.

Detail data adds nullable `description`/`descriptionApproval`, `comments`, and `outboundAssigneeWarnings`. Each comment retains `id`, `taskId`, `content`, `createdAt`, nullable `authorActorId`/legacy `author`, `authorDisplayName`, and nullable `contentApproval`. Both approval objects preserve `state` and optional `sourceBindingId`, `sourceActorId`, `sourceFingerprint`, `reviewedAt`, and `reviewedByActorId`. Null approval means no available approval metadata, **not** approval. Content remains untrusted data even after review.

Each outbound-assignee warning retains `bindingId`, `provider`, `targetRef`, `unmappedActorIds`, and `unmappedAssigneeDisplayNames`. Envelope warnings also include these objects with code `unmapped_outbound_assignees` and the task target. If integration-warning enrichment is unavailable, the task has optional `outboundAssigneeWarningsUnavailable: true`, and the envelope includes `outbound_assignee_warnings_unavailable`. Task data and any known warnings remain available; an empty warning array then does not prove there are no unmapped assignees. No warning lookup is needed for a task without a project or assigned actor IDs.

The schemas in `src/tools/task-read-schemas.ts` close every payload object. Allowlisted projections exclude unrelated backend fields, credentials, integration options, raw diagnostics, and exception causes from structured data and compatible task details. Intentional task text/IDs remain user data; this is not a generic credential redaction engine.

## Failures and ordinary calls

Always inspect `ok`. In Pi 1.1.0, a schema-bearing call with structured content resolves even when its outer `isError` is true. `Promise.allSettled()` fulfillment alone therefore does not establish success.

- Confirmed task absence (`getTask` returns null) produces `not_found`, `ok: false`, and non-error human text. A transport/enrichment failure never becomes absence or an empty list.
- A blank task ID or known service `validation` code produces `validation_error` with safe text and `isError: true`.
- Known service `not-found`, `conflict`, `precondition-failed`, `unavailable`, `timeout`, and `internal` errors produce `backend_error` with safe text and `isError: true`. Service-level not-found can come from enrichment; it does not confirm the requested task is missing.
- Unrecognized failures, including initialization errors without a known service code, still reject with sanitized, tool-specific context. Output-contract/projection failures also throw fixed safe messages outside the backend-failure boundary. Pi argument validation, permissions, hooks, and cancellation may fail outside the tool handler.

Success, empty, and missing results retain their readable text and existing `details` shapes (`kind`, normalized `filter`, tasks/totals/empty or taskId/found/task). Task objects are allowlisted copies, not backend object identities. Known failures have undefined `details`, not fake empty/missing results. Outbound warnings now display even when there are no comments; unavailable enrichment is also visible in text. TUI list/detail rendering and state contracts are unchanged.

## Codemode example

This example merges two reads, deduplicates by task ID, and sorts canonical date-only values with nulls last. It intentionally leaves next-actions selection and mixed-date sorting policy to the caller.

```js
const outcomes = await Promise.allSettled([
  tools.task_list({ statuses: ["active"] }),
  tools.task_list({ statuses: ["waiting"] }),
]);
const tasks = [];
for (const outcome of outcomes) {
  if (outcome.status === "rejected") {
    text("Task read rejected; no structured outcome is available.");
    continue;
  }
  const result = outcome.value;
  if (!result.ok) {
    text({ status: result.status, warnings: result.warnings });
    continue;
  }
  tasks.push(...result.data.tasks);
  if (result.warnings.length) text(result.warnings);
}
const merged = [...new Map(tasks.map((task) => [task.id, task])).values()];
if (merged.some((task) => task.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))) {
  throw new Error("Choose a sorting policy for non-date-only due values");
}
merged.sort((a, b) => {
  if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
  if (b.dueDate === null) return -1;
  return a.dueDate.localeCompare(b.dueDate);
});
text(merged);

const shown = await tools.task_show({ taskId: "task-example" });
if (shown.ok) text(shown.data.task);
else if (shown.status === "not_found") text({ missing: shown.target });
else text({ status: shown.status, error: shown.error, warnings: shown.warnings });
```

The representation check is not a complete calendar-date validator. Timestamp collections should compare validated instants instead; mixed calendar dates/timestamps need an explicit timezone policy. See [task date sorting](task-dates.md#sorting-merged-results).

## Verification scope

`src/__tests__/task-read-outputs.test.ts` covers schema/JSON conformance, normalized filters, explicit empty/missing/error states, safe failures, allowlisted projections, approval/provenance retention, warning availability, and script-style merging/deduplication/sorting. Existing task-read/date tests verify readable text, compatible details, exact date values, and unchanged TUI models. These are unit tests with mocked services/RPCs, not an installed-extension or real codemode smoke run. Packaged/direct/nested compatibility is exercised separately by `npm run smoke:codemode` through the real Pi SDK/QuickJS runtime using isolated synthetic state. See [opt-in smoke coverage, compatibility findings, and limitations](codemode-smoke.md). Default CI remains unchanged; no integration smoke was added to it.
