# Task mutation outcomes

Task create, update, and move distinguish an acknowledged write from optional metadata reads. This behavior does not change pre-write project resolution, assignment validation, authorization, or imported-content approval rules.

## Confirmed success, incomplete enrichment

Once the daemon acknowledges the mutation, a failed comment, actor, project, or outbound-assignee-warning lookup does not turn it into a failed write. The returned `TaskDetail` preserves the confirmed task ID and mutation response data. For moves, `MoveTaskResult` preserves both `sourceTaskId` and the new `targetTask.id`.

An optional `enrichmentWarnings` array describes unavailable metadata using stable `source` values:

| Source                 | Meaning                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comments`             | The returned comment list is incomplete, not proof that there are no comments. Update/move load comments; create keeps its existing empty comment list without an extra read. |
| `actors`               | Display names and archived-state annotations may be incomplete; actor IDs and available legacy names remain intact.                                                           |
| `project`              | Project name and authorization annotations may be incomplete; the project ID remains available. A missing post-write project also produces this warning.                      |
| `integration-warnings` | Outbound mapping warnings could not be checked. An empty warning list is not proof that all assignees are mapped. `outboundAssigneeWarningsUnavailable` remains true.         |

Warnings contain fixed diagnostic text, not raw backend/transport error messages. Existing imported-content approval and provenance metadata is retained. Task mutation tools show the confirmed IDs and warnings in readable content and keep warnings on the task in legacy `details`. Task detail rendering also displays them. This task does not migrate mutation tools to codemode `outputSchema`/`structuredContent`.

**Do not repeat a confirmed write to repair enrichment.** If needed, read the confirmed task ID again later. Ordinary task reads retain their existing failure behavior; they are not converted into mutation success.

## Dispatch failures

`ToduDaemonClientError.mutationOutcome` and `ToduTaskServiceError.mutationOutcome` distinguish:

| Outcome          | Evidence and handling                                                                                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-dispatched` | The connection was unavailable before the write was attempted. No write was sent by this request.                                                                                                                                                                                                                     |
| `rejected`       | The daemon returned a matching error response. The ordinary validation/not-found/conflict/etc. error code is retained. Even a daemon-returned `TIMEOUT` is distinct from a local response timeout.                                                                                                                    |
| `uncertain`      | The request may have been dispatched, but no success/rejection was received: response timeout, connection loss, or a thrown request exception with no dispatch evidence. Client code / service `causeCode` is `uncertain`. Verify backend state before considering a retry. A newly created task ID may not be known. |

The connection records local `requestState` evidence separately from untrusted daemon error details. Pending requests lost on disconnect or malformed responses are conservatively marked dispatched; synchronous write exceptions are also treated conservatively. Explicit daemon error responses are marked rejected. Mutation tools report uncertain outcomes as **outcome unknown**, not as not-found or confirmed failure.

There are no automatic write retries or backend idempotency changes. Connection reconnection does not replay writes. Cancellation, timeout, or disconnect does not undo an operation the backend may already have committed. This behavior is scoped to create/update/move, not a general redesign of every mutation tool.
