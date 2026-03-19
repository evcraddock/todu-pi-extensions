# Task create flow

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#stage-3-task-mutation-workflows
Related tasks: task-ed988075
Last updated: 2026-03-19

## Problem

The architecture calls for creating tasks from inside pi, but the current implementation does not expose that workflow. `src/flows/create-task.ts` exists only as a thin service wrapper, and `src/extension/register-commands.ts` does not register `/task-new` or any other create entrypoint.

That leaves an important gap in the intended workflow: users can browse, inspect, comment on, and update tasks, but they cannot capture newly discovered work without leaving pi. It also blocks follow-up work on richer mutation flows because there is no agreed UX for task creation yet.

## Goal

Add a small, documented, testable task-creation workflow in pi that lets a user create a task from the current session without leaving the TUI.

### Success criteria

- [x] A user can invoke a create-task flow from pi and submit a new task with a required title.
- [x] The first version supports at least an optional description field.
- [x] After creation, the user gets a clear success path: the new task becomes current and opens in task detail.
- [x] Failure, cancellation, and non-interactive behavior are explicitly defined.
- [x] The implementation can be split into concrete tasks with clear verification steps.

## Non-goals

The first version should stay small.

- Project-specific defaults beyond explicit user selection are out of scope for V1.
- Labels are not required in V1.
- Multi-step custom forms or custom TUI primitives are not required in V1.
- Agent-facing task-creation tools are out of scope for this plan.
- Creating follow-up tasks directly from task detail can be deferred if command-driven creation lands first.

## User-facing behavior

### Entry points

Planned V1 entrypoints:

- `/task-new` command

Deferred entrypoints:

- task-detail quick action for "Create follow-up task"
- agent-facing task creation tool

### Main flow

Proposed V1 flow:

1. User runs `/task-new`.
2. If pi is running with a TUI, the extension opens a small create flow using built-in UI affordances.
3. The flow gathers:
   - title (required)
   - project assignment (required)
   - description (optional)
4. The extension submits `TaskService.createTask()`.
5. On success, the extension shows a success notification.
6. The extension opens the new task detail view.
7. The extension does not automatically change the current task context.

This keeps create behavior aligned with the existing browse/detail workflow without unexpectedly replacing the user's current task context.

### Error, empty, and cancel states

- If the user cancels before submission, the extension should exit cleanly and show an informational notification at most.
- If the title is blank or whitespace-only, the flow should not submit. It should either re-prompt or show a validation error and return to editing.
- If task creation fails, the extension should show a contextual error notification using the existing error-formatting style.
- There is no meaningful empty state for creation beyond validation failures.

### Non-interactive behavior

If pi is running without a TUI, `/task-new` should fail gracefully with a short stderr message, consistent with `/tasks` and `/task`.

## Technical approach

### Affected areas

Likely files/modules:

- `src/extension/register-commands.ts`
- `src/flows/create-task.ts`
- `src/services/task-service.ts`
- `src/extension/current-task-context.ts`
- `src/ui/components/loaders.ts`
- new helper(s) under `src/ui/components/` or `src/flows/` for input collection
- tests may be deferred for this flow if manual verification remains the chosen approach

### Data and state

Known service contract:

- `TaskService.createTask(input)` already exists
- supported input today:
  - `title`
  - `description?`
  - `projectId?`
  - `labels?`

V1 should submit `title`, required `projectId`, and optional `description`.

Session/UI behavior after success:

- the new task should open in detail after successful creation
- the current task should remain unchanged unless the user explicitly sets it later
- after creation, opening task detail should reuse existing detail flow rather than duplicating rendering logic

Implementation shape options:

1. **Small sequential prompts using existing built-ins**
   - gather title first with an inline prompt
   - gather project selection with a documented selection UI such as `SelectList`
   - optionally gather description in `ctx.ui.editor()`
   - lowest complexity

2. **Single compact custom form**
   - more cohesive UX
   - higher implementation cost

Recommended V1: option 1.

Reason: it is the most boring path, matches the architecture's preference for built-in primitives, and should be easiest to implement and reason about.

### Testing approach

Do not add integration tests for this flow as part of the initial implementation. Verification for V1 should be manual.

Manual verification should confirm:

- `/task-new` works in interactive mode
- blank title input is rejected or re-prompted according to the chosen UX
- project selection is required before submission
- cancellation exits cleanly
- task creation failures surface a clear error
- created task can be opened immediately in detail view
- current-task widget/status remain unchanged after successful creation unless the user explicitly sets the new task as current

## Open questions

These should be resolved before marking the plan `ready-for-tasking`.

- [x] V1 should use one command only: `/task-new`. Detail-level follow-up task creation is deferred.
- [x] After successful creation, the new task should open in detail without automatically becoming current.
- [x] The required title should use an inline prompt.
- [x] V1 must require explicit project selection during task creation.

Intentional deferral candidates:

- labels
- richer metadata on create
- creating tasks from agent tools
- follow-up linking semantics between tasks

## Task breakdown candidates

1. **Define V1 UX and command contract**
   - confirm `/task-new` behavior
   - settle post-create behavior and validation rules
   - success criteria: command contract and UX decisions are fixed

2. **Implement command wiring and input collection**
   - register `/task-new`
   - gather title and optional description using chosen built-ins
   - success criteria: successful submit path reaches `TaskService.createTask()`

3. **Integrate post-create detail behavior**
   - open created task in existing detail flow
   - preserve the existing current-task context
   - success criteria: success path feels coherent with current browse/detail UX without replacing the user's current task

4. **Add tests for create flow**
   - success, cancel, validation, and failure coverage
   - success criteria: relevant tests pass and cover user-visible outcomes

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
- `src/flows/create-task.ts`
- `src/extension/register-commands.ts`
- `src/services/task-service.ts`
- `src/extension/current-task-context.ts`
