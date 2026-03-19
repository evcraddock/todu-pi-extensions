# Sync status UI

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#current-event-model-and-client-behavior
Related tasks: task-f4f6d1b3
Last updated: 2026-03-19

## Problem

The architecture says the extension should treat `sync.statusChanged` as a direct sync/status UI update signal, but the current implementation does not react to that event anywhere. The daemon event names exist in `src/services/todu/daemon-events.ts`, but the extension only subscribes to `data.changed` through the current-task context controller.

That leaves a documented behavior gap: the extension has a persistent daemon-backed client, but there is no user-visible indication of current sync state or sync changes.

## Goal

Add a small V1 sync-status UI so the extension can surface daemon sync state changes without introducing a large new UI surface.

### Success criteria

- [x] The extension reacts to `sync.statusChanged` daemon events.
- [x] Users can see a compact sync-state indicator in the UI.
- [x] Sync-state updates do not interfere with current-task status or widget behavior.
- [x] Error and degraded-state behavior are defined.
- [x] The work can be split into concrete implementation tasks.

## Non-goals

This plan should keep sync UI minimal.

- A dedicated sync dashboard is out of scope for V1.
- Sync history is out of scope for V1.
- Detailed conflict-resolution UI is out of scope for V1.
- Notifications for every sync transition are out of scope for V1 unless a specific state needs escalation.
- Changes to daemon event contracts are out of scope for this plan.

## User-facing behavior

### Entry points

Planned V1 entrypoints:

- passive UI updates driven by `sync.statusChanged`
- compact status display in ambient UI

Deferred entrypoints:

- dedicated sync command
- detailed sync widget or panel
- agent-facing sync-status tool

### Main flow

Proposed V1 flow:

1. The extension subscribes to `sync.statusChanged` from the daemon-backed client.
2. When a sync event arrives, the extension updates a compact sync indicator.
3. The sync indicator reflects the latest known sync state.
4. The update should be independent of task browsing/detail flows and should not replace current-task context.

Recommended V1 UI shape:

- use a separate footer status key for sync state
- keep the current-task widget unchanged
- keep sync status in the footer only for V1

This keeps sync awareness visible but small.

### Error, empty, and cancel states

- Before any sync event has been observed, the sync indicator should show an initial unknown state.
- If the daemon connection drops or sync state becomes unknown, the indicator should move to a neutral degraded state rather than showing stale success.
- If event payloads are missing fields or contain unknown values, the UI should fall back to a safe generic label rather than failing.
- There is no cancellation state because sync updates are passive.

### Non-interactive behavior

No new non-interactive behavior is required for V1. This plan focuses on ambient UI updates during interactive usage.

## Technical approach

### Affected areas

Likely files/modules:

- `src/extension/register-ui.ts`
- `src/extension/register-events.ts`
- `src/services/todu/daemon-events.ts`
- `src/services/todu/default-task-service.ts`
- new sync-status controller/helper under `src/extension/` or `src/services/`
- tests may be deferred if manual verification remains the chosen approach

### Data and state

Known current behavior:

- current-task context owns the `data.changed` subscription path
- there is no separate sync-state controller today
- ambient UI already uses keyed status slots through `ctx.ui.setStatus(...)`

Recommended V1 implementation shape:

- add a small controller dedicated to sync-state UI
- subscribe to `sync.statusChanged` once per active session/runtime
- normalize daemon sync payloads into a small internal view model
- support first-class labels for `running`, `idle`, `blocked`, and `error`
- keep a safe fallback label for unknown future values
- write sync status through its own footer status key
- keep sync state separate from current-task session state; it should be runtime-derived, not persisted in session entries

Preferred state model:

- latest known sync state lives in memory only
- on session switch/start, the controller reattaches to the active context
- if the runtime reconnects and re-subscribes, the sync UI should resume updating without needing session persistence

### Testing approach

Do not add integration tests for this flow as part of the initial implementation. Verification for V1 should be manual.

Manual verification should confirm:

- a `sync.statusChanged` event updates the sync indicator
- sync indicator uses a separate footer status key from current-task status
- current-task widget and footer status continue to work unchanged
- unknown or degraded sync states render safely
- reconnect or daemon restart does not permanently break sync updates

## Open questions

These should be resolved before marking the plan `ready-for-tasking`.

- [x] V1 should support all currently known candidate sync labels: `running`, `idle`, `blocked`, and `error`, with a safe fallback for unknown future values.
- [x] V1 should show sync status only in the footer.
- [x] The sync indicator should appear immediately with an initial unknown state.

Intentional deferral candidates:

- conflict details
- sync activity history
- dedicated sync commands
- sync-specific widgets or panels
- persistent sync-state session history

## Task breakdown candidates

1. **Define V1 sync-state UX contract**
   - settle labels, degraded behavior, and visibility rules
   - success criteria: sync indicator behavior is fixed and documented

2. **Implement sync-status controller and subscription**
   - subscribe to `sync.statusChanged`
   - normalize event payloads
   - write compact sync status to ambient UI
   - success criteria: live sync events update the footer status reliably

3. **Manual verification pass**
   - verify normal, degraded, and reconnect behavior
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
- `src/services/todu/daemon-events.ts`
- `src/extension/register-ui.ts`
- `src/extension/register-events.ts`
- `src/extension/current-task-context.ts`
