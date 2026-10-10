# Task dates

## Returned fields

`TaskSummary` and its derived `TaskDetail` retain these backend fields in list, search, and detail results. The names and backend types are verified against `Task` / `TaskWithDetail` in the installed `@todu/core` 0.23.2 declarations (`dist/types.d.ts`). Service metadata enrichment preserves them, and `task_list` / `task_show` include them in both their compatible result `details` and structured output `data`.

| Field           | Backend type    | Extension type   | Meaning / missing value                                                                          |
| --------------- | --------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `dueDate`       | Optional string | `string \| null` | Due date/value; omitted or undefined becomes `null`. A returned null is also retained as `null`. |
| `scheduledDate` | Optional string | `string \| null` | Planned/scheduled date/value, distinct from the due date; same missing-value behavior.           |
| `createdAt`     | Required string | `string`         | Backend task creation timestamp, copied verbatim.                                                |
| `updatedAt`     | Required string | `string`         | Backend last-update timestamp, copied verbatim.                                                  |

The extension does not substitute the current time, an epoch, a sentinel date, or the scheduled date for missing values. Creation/update timestamps are required by the typed backend contract; an absent timestamp is an out-of-contract response, not an undated task. This change does not add runtime validation of daemon response shapes or synthesize missing timestamps.

The shared summary mapper also serves create/update/move result mapping, so returned dates survive those paths without adding date mutation parameters. This task does not implement setting or clearing dates.

## Preserve date meaning

All non-null strings are retained exactly as returned. No `Date` construction, ISO conversion, timezone conversion, trimming, or timestamp-to-date truncation occurs in mapping or text rendering.

- A date-only value such as `2026-03-08` denotes a calendar date, not a local-time instant. Preserve the string instead of parsing and formatting it through local timezone APIs.
- A timestamp such as `2026-03-08T00:30:00+14:00` carries time/offset information. Do not discard that information or replace it with `2026-03-07` after conversion to UTC.
- Creation/update values retain their precision and offsets exactly as supplied by the daemon. Do not infer that they use the same representation as due/scheduled dates.

The installed backend `validateISODate` validator accepts strings parseable by JavaScript `Date`; it does **not** enforce `YYYY-MM-DD` only. Consequently the extension does not claim every due/scheduled value is date-only or validate/rewrite historical values during reads. Consumers needing a narrower representation must check it and choose an explicit policy rather than silently coercing it.

`task_list` text appends `• due: <original value>` for a populated due date; `task_show` text includes `Due: <original value>`. Tasks without a populated due date retain their previous text layout. Scheduling and creation/update fields remain in data rather than adding more display noise. Existing TUI list/detail rendering is unchanged.

## Sorting merged results

Consumers have enough data to merge and deduplicate lists by ID and sort due dates with nulls last without parsing human-readable output. For a collection of canonical date-only `YYYY-MM-DD` values, use calendar-date string ordering:

```ts
// first and second are TaskSummary[] returned by the task service.
const tasks = [...new Map([...first, ...second].map((task) => [task.id, task])).values()];

if (tasks.some((task) => task.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate))) {
  throw new Error("Choose a sorting policy for non-date-only due values");
}

tasks.sort((a, b) => {
  if (a.dueDate === null) return b.dueDate === null ? 0 : 1;
  if (b.dueDate === null) return -1;
  return a.dueDate.localeCompare(b.dueDate);
});
```

That representation check is not a complete calendar-date validator; use it only with valid backend dates. For timestamp collections with explicit timezones, compare parsed instants instead of string ordering: `Date.parse(a.dueDate) - Date.parse(b.dueDate)`, after the same null checks and validation that both values are finite instants. Offset timestamps can sort differently lexically and chronologically. If a collection mixes timestamps and date-only values, define the calendar-date-versus-instant policy explicitly; do not introduce an implicit local timezone. The extension's existing per-query sort/filter behavior is unchanged by this mapping task; these examples describe caller-side merged-result ordering, not a new workflow policy or comparator API.

Codemode receives the structured envelope directly from `task_list` and `task_show`. Check `ok` before reading `data.tasks` or `data.task`; see [task read outputs](task-read-outputs.md) for a merge/deduplicate/sort example. No parsing-based workaround or next-actions workflow is introduced.

## Verification

`src/__tests__/task-date-results.test.ts` covers populated, absent, undefined, and null optional dates; independent due/scheduled values; exact date-only and offset timestamp preservation; service enrichment and tool details/structured outputs; search results; unchanged TUI models; and caller-side merging/deduplication/sorting with nulls last. All RPC responses in these unit tests are mocked; they do not connect to or modify normal Todu data.
