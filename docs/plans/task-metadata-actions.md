# Task metadata actions

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#4-update-task-status-and-metadata
Related tasks: task-b379347c
Last updated: 2026-03-19

## Problem

The architecture calls for quick updates to status and other simple task metadata from the task detail view, but the current implementation only partially delivers that. Today the task detail actions support:

- set current task
- update status
- add comment

That leaves the broader metadata story undefined. In particular, the code already has `taskPriorityOptions` and `TaskService.updateTask()` supports `priority`, but there is no user-facing quick action for editing priority. Without a plan, "metadata actions" remains vague and is harder to break into clean implementation tasks.

## Goal

Define a small V1 metadata-editing workflow for task detail that expands beyond status updates while staying aligned with the current command-and-detail interaction model.

### Success criteria

- [x] The V1 metadata scope is explicitly defined.
- [x] Users can update task priority from the task detail view.
- [x] Status and priority updates share a coherent interaction pattern.
- [x] Success, error, cancel, and refresh behavior are explicitly defined.
- [x] The work can be split into small concrete tasks.

## Non-goals

This plan should keep metadata scope narrow.

- Editing labels is out of scope for V1.
- Editing project assignment is out of scope for V1.
- Editing assignee is out of scope for V1 unless the backend exposes a stable assignee concept later.
- Creating a general-purpose task edit form is out of scope for V1.
- Agent-facing metadata mutation tools are out of scope for this plan.

## User-facing behavior

### Entry points

Planned V1 entrypoint:

- task detail quick actions opened through the existing `/tasks` and `/task` flows

Deferred entrypoints:

- standalone slash commands for priority changes
- bulk edit workflows
- agent-facing metadata mutation tools

### Main flow

Proposed V1 metadata scope:

- status
- priority

Proposed V1 interaction model:

1. User opens task detail through existing browse or task-detail command flows.
2. User chooses a quick action from the task detail action list.
3. For status updates, the extension opens the existing selection flow.
4. For priority updates, the extension opens a matching selection flow using the existing priority options.
5. The extension submits the update through `TaskService.updateTask()`.
6. On success, the detail view refreshes.
7. If the updated task is the current task, current-task status/widget state refreshes as well.
8. The extension shows a brief success notification.

Recommended V1 detail actions:

- Set as current task
- Update status
- Update priority
- Add comment

This keeps metadata editing anchored in the existing detail hub rather than adding new top-level commands.

### Error, empty, and cancel states

- Cancelling a status or priority selection should return to the detail hub without changing the task.
- Choosing the already-current status or priority should no-op without an error.
- If the update call fails, the extension should show a contextual error notification.
- There is no separate empty state for metadata editing beyond the normal task-detail missing-task handling.

### Non-interactive behavior

No new non-interactive behavior is required for this plan. Metadata actions remain part of the interactive task-detail flow.

## Technical approach

### Affected areas

Likely files/modules:

- `src/ui/components/task-detail.ts`
- `src/ui/components/task-settings.ts`
- `src/extension/register-commands.ts`
- `src/flows/update-task.ts`
- `src/services/task-service.ts`
- `src/extension/current-task-context.ts`
- tests may be deferred if manual verification remains the chosen approach

### Data and state

Known existing capabilities:

- `TaskService.updateTask()` already supports `status`, `priority`, and `description`
- task detail action rendering is centralized in `src/ui/components/task-detail.ts`
- status option rendering already exists in `src/ui/components/task-settings.ts`
- priority option definitions already exist in `src/ui/components/task-settings.ts`
- current-task sync after status update already exists through `syncCurrentTaskIfFocused(...)`

Recommended V1 implementation shape:

- extend task detail action kinds to include `update-priority`
- reuse the same generic selection pattern for both status and priority updates
- refactor toward a shared selection helper if that keeps the implementation small and clear
- reuse `updateTask(...)` for priority mutation
- reuse current-task refresh logic after mutation success

Description editing is explicitly deferred for now. Although `TaskService.updateTask()` supports `description`, that requires deciding whether to use `ctx.ui.editor()` and whether description belongs in the same milestone. That is broader than this V1 metadata scope.

### Testing approach

Do not add integration tests for this flow as part of the initial implementation. Verification for V1 should be manual.

Manual verification should confirm:

- task detail shows an `Update priority` action
- selecting a new priority updates the task successfully
- selecting the existing priority is a no-op
- cancelling priority selection returns cleanly to the detail hub
- status update behavior still works after the refactor/addition
- current-task widget/status refresh when the focused task changes priority or status
- update failures surface a clear error

## Open questions

These should be resolved before marking the plan `ready-for-tasking`.

- [x] Description editing remains deferred for V1.
- [x] Status and priority should use the same generic selection pattern.

Intentional deferral candidates:

- labels
- project reassignment
- assignee edits
- description editing
- bulk metadata changes

## Task breakdown candidates

1. **Define V1 metadata scope**
   - confirm which editable fields are in scope now
   - success criteria: V1 is explicitly limited to a small agreed set

2. **Add priority task-detail action and selection flow**
   - extend task detail actions
   - add priority selection UI using existing option definitions
   - success criteria: users can choose and submit a new priority from detail view

3. **Integrate mutation refresh behavior**
   - ensure detail and current-task state refresh correctly after status and priority changes
   - success criteria: focused task UI stays in sync after mutation

4. **Manual verification pass**
   - verify success, cancel, no-op, and failure behavior
   - success criteria: documented V1 behavior is confirmed manually

## Task-ready checklist

- [x] Scope is bounded.
- [x] User-facing behavior is clear.
- [x] Error and cancellation behavior is defined.
- [x] Affected code areas are identified.
- [x] Test strategy is clear.
- [x] Open questions are resolved or explicitly deferred.
- [x] Work can be split into concrete tasks with clear success criteria.

## References

- `docs/architecture.md`
- `src/ui/components/task-detail.ts`
- `src/ui/components/task-settings.ts`
- `src/flows/update-task.ts`
- `src/services/task-service.ts`
- `src/extension/current-task-context.ts`
