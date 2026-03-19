# Task clear flow

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#initial-screen-model
Related tasks: task-754de684
Last updated: 2026-03-19

## Problem

The architecture includes `/task-clear` as part of the initial command surface, but the current implementation does not expose any user-facing way to clear the current task context. The underlying capability already exists in `CurrentTaskContextController.clearCurrentTask()`, so the gap is mostly command design and user-visible behavior.

Without a clear command, users can set a current task but cannot intentionally remove it from session context. That leaves the footer status and current-task widget sticky until another task is selected or the session state changes indirectly.

## Goal

Add a small, explicit command for clearing the current task context so users can remove task focus from the session when they are done or want to work without an active task.

### Success criteria

- [x] A user can run `/task-clear` to remove the current task from session state.
- [x] Footer status and current-task widget clear immediately after success.
- [x] The command behaves clearly when no current task is set.
- [x] The behavior is defined for both interactive and non-interactive usage.
- [x] The implementation is small and easy to turn into concrete tasks.

## Non-goals

This plan is intentionally narrow.

- Adding a confirmation dialog is out of scope for V1.
- Clearing browse filters, last-viewed task state, or any future UI state is out of scope.
- Adding a slash-command alias is out of scope.
- Agent-facing clear-current-task tools are out of scope for this plan.

## User-facing behavior

### Entry points

Planned V1 entrypoint:

- `/task-clear` command

Deferred entrypoints:

- task-detail action for clearing current task
- agent-facing clear-current-task tool

### Main flow

Proposed V1 flow:

1. User runs `/task-clear`.
2. The extension checks the current-task context state.
3. If a current task is set, the extension clears it through `CurrentTaskContextController.clearCurrentTask()`.
4. Session state is persisted with `currentTaskId: null`.
5. Footer status and current-task widget are removed.
6. The extension shows a brief success notification.

Recommended notification text can stay simple, for example: `Cleared current task`.

No confirmation step is needed. The action is local, reversible, and low risk.

### Error, empty, and cancel states

- If no current task is set, the command should not fail. It should no-op and show a brief informational notification such as `No current task to clear`.
- There is no cancellation state because the command does not open an interactive flow.
- If clearing state unexpectedly fails, the extension should show a contextual error notification.

### Non-interactive behavior

Unlike `/tasks` and `/task`, `/task-clear` should not require a TUI. It should work in both interactive and non-interactive contexts because it only updates session state and optional ambient UI.

If no UI is available, the command should still clear session state and print a short success message. Error output should remain minimal and contextual.

## Technical approach

### Affected areas

Likely files/modules:

- `src/extension/register-commands.ts`
- `src/extension/current-task-context.ts`
- `src/services/task-session-store.ts`
- existing command tests if any are used for command registration/behavior

### Data and state

Known existing behavior:

- `CurrentTaskContextController.clearCurrentTask(ctx)` already delegates to `setCurrentTask(ctx, null)`
- clearing current task already persists session state through `persistTaskSessionState(...)`
- `updateAmbientUi()` already removes footer status and widget when there is no current task

This means V1 should avoid adding new state machinery. The main implementation should be command wiring and user-visible messaging.

Expected behavior details:

- when clearing succeeds, session state should contain `currentTaskId: null`
- current-task widget should be removed
- current-task footer status should be removed
- future session restore should keep the cleared state because the latest session entry reflects null current task

### Testing approach

Do not add integration tests for this flow as part of the initial implementation. Verification for V1 should be manual.

Manual verification should confirm:

- `/task-clear` clears the current task when one is set
- footer status clears immediately
- current-task widget clears immediately
- running `/task-clear` with no current task does not fail
- cleared state remains cleared across normal session restoration behavior
- non-interactive invocation prints a short success message

## Open questions

These should be resolved before marking the plan `ready-for-tasking`.

- [x] In non-interactive mode, `/task-clear` should print a short success message.

Intentional deferral candidates:

- confirmation UX
- alternate entrypoints for clearing task context
- model-facing clear-current-task tools

## Task breakdown candidates

1. **Define `/task-clear` command contract**
   - settle no-op behavior when no current task exists
   - settle non-interactive output behavior
   - success criteria: command semantics are fixed

2. **Implement command wiring**
   - register `/task-clear`
   - call the existing current-task controller clear method
   - success criteria: command clears session task context and updates ambient UI

3. **Manual verification pass**
   - verify clear, no-op, session persistence, and UI cleanup behavior
   - success criteria: the documented V1 behavior is confirmed manually

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
- `src/extension/current-task-context.ts`
- `src/extension/register-commands.ts`
- `src/services/task-session-store.ts`
