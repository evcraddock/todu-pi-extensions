# Task update assignee parameters

For a status-only update, send only the task ID and status:

```json
{ "taskId": "task-123", "status": "done" }
```

The same rule applies to other non-assignment updates: omit assignee parameters or use `null`. Never use `assigneeActorIds: []` as an unused placeholder; it explicitly clears every assignee.

## Parameter semantics

| Parameter                | Omitted or `null`           | `[]`                           | Non-empty list                 |
| ------------------------ | --------------------------- | ------------------------------ | ------------------------------ |
| `assigneeActorIds`       | Leave assignments unchanged | Explicitly clear all assignees | Replace the full assignee list |
| `addAssigneeActorIds`    | No additions                | No additions                   | Add these actors               |
| `removeAssigneeActorIds` | No removals                 | No removals                    | Remove these actors            |

An explicit replacement (including `[]`) cannot be combined with non-empty add/remove lists. Empty incremental lists are no-ops and do not conflict with a replacement. Sending all three lists as `[]` therefore explicitly clears all assignees; callers must use omission or `null` for the replacement field when preserving assignments.

A call containing only no-op assignee parameters, without any supported change, is rejected. Existing actor authorization and archived-actor checks still apply to real assignment changes.

## Regression investigation: task-73c41a52

The reported screenshot shows repeated `task_update cannot combine assigneeActorIds with addAssigneeActorIds or removeAssigneeActorIds` errors while the agent describes a status-only update. It does not show the actual tool-call arguments, model/provider, or installed versions on the affected machine. Those details remain unconfirmed; the following is a local reproduction, not a recovered remote payload.

With the pre-fix extension at version 0.5.0 and Pi AI 0.87.1, this schema-valid input reproduces the exact conflict:

```json
{
  "taskId": "task-123",
  "status": "done",
  "assigneeActorIds": ["actor-user"],
  "addAssigneeActorIds": [],
  "removeAssigneeActorIds": []
}
```

The resolver checked whether each list was defined rather than whether an incremental list contained any operations. Empty add/remove lists therefore caused false conflicts. Empty incremental lists without a replacement also unnecessarily read and rewrote the existing assignments.

Pi AI 0.87.1's `validateToolArguments` removes optional `null` values when the schema does not allow null, so a null-only raw call does not reproduce the conflict through that installed validation path. Direct resolver calls with null-valued fields did reproduce the same error. The fix explicitly allows null assignee parameters in the schema and treats them as omitted in the resolver, rather than depending on host-specific null normalization.

Regression tests in `src/__tests__/task-mutation-tools.test.ts` exercise both the resolver and Pi's schema-validation-to-execution path. They cover omitted, null, and empty incremental lists; explicit replacement and clearing; genuine conflicts; invalid object values; and status-only updates that do not send an assignee mutation to the service.
