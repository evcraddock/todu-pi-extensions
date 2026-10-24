# Concurrent task updates

The registered `task_update` tool owns a FIFO queue keyed by the normalized task ID. The queue covers service acquisition, task reads, label/assignee modification, authorization checks, and the write. Every update through that tool uses the queue, including explicit assignee replacements and status-only updates, so a replacement cannot overtake an incremental update's validation/write window.

Two incremental edits to the same task read and write in order. The second reads the state left by the first, rather than constructing a replacement from the same old snapshot. Different task IDs have independent queues and can proceed concurrently. Queue entries are removed after their tails settle; success and failure both release their slot without poisoning later work.

Existing assignment rules are unchanged: omission/null preserves assignments, an explicit replacement `[]` clears assignments, empty incremental lists are no-ops, and conflicting real replacement/incremental edits are rejected. Authorization and archived-actor checks run inside the queue using the state available when the update takes its turn. See [assignee parameters](task-update-assignees.md).

## Cancellation

Pi's tool `AbortSignal` is checked before entering the queue and between pre-write asynchronous stages.

- A cancelled waiter rejects promptly without acquiring services, reading, validating, or writing. Its successor still waits for the active predecessor; cancelling a waiter cannot release someone else's slot.
- Cancellation during service acquisition, a task/project read, or an actor lookup is detected when that already-running operation settles. No subsequent write is dispatched. This task does not add cancellation support to the underlying read/connection APIs.
- Once the write is dispatched, abort does not release the lock early or claim a rollback. The queue waits for the service operation to settle and preserves confirmed success or the reported failure/uncertain outcome.
- There are no automatic retries. An underlying operation that never settles will continue holding that task's slot; the queue deliberately does not use an abort race to allow overlapping writes. Other task IDs remain independent.

## Scope and cross-client limits

The queue belongs to one registered `task_update` tool instance in an extension runtime. It is not a backend lock and is not persisted or shared across Pi processes, runtime reloads, separate tool definitions, CLI clients, sync workers, or direct service/SDK calls. Those writers can still change the task between this tool's read and write. A rejected or uncertain write releases the local slot; a timeout/disconnect does not prove the backend stopped working. Check backend state before considering another edit after an uncertain outcome. See [mutation outcomes](task-mutation-outcomes.md).

## Backend support inspected

The installed `@todu/core` **0.23.2** `UpdateTaskInput` exposes `labels` and `assigneeActorIds` replacement arrays, not atomic add/remove operations or revision preconditions. Its optional `updatedAt` field assigns a timestamp; it is **not** an expected-version comparison.

The local todu **0.24.1** checkout at commit `e0020c5e8bc9d836913486b80ea1c4d23e14ad23` was also inspected:

- `packages/engine/src/todu.ts`: public `TaskNamespace.update(id, input)` has no expected-revision argument. Internal `SyncRuntimeTaskTools.updateIfCurrent` accepts observed state for guarded sync writes.
- `packages/engine/src/tasks.ts`: internal guarded writes compare observed state at the mutation boundary. Ordinary updates replace supplied label/assignee arrays.
- `packages/daemon/src/core-rpc-adapters.ts`: public `task.update` forwards only task ID and update input, not the internal guard.

This is source/API inspection, not a claim about every deployed daemon version. Cross-client protection needs a public atomic-delta or revision-check contract; it cannot be achieved with this extension-local queue alone. Backend follow-up **task-519b226c — Support cross-client safe incremental task updates** is recorded in the `todu` project. Backend changes are outside this task.
