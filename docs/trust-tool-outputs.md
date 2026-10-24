# Note, integration, and approval outputs

These tools declare `outputSchema` and return schema-validated `structuredContent` using the [shared version 1 envelope](tool-result-contracts.md):

| Tool                                | Successful `data`                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `note_list`                         | `filter`, `notes`, `total`, `empty`                                            |
| `note_show`                         | `note`                                                                         |
| `integration_list`                  | `filter`, `bindings`, `projectNames`, `total`, `empty`                         |
| `integration_show`                  | `binding`, nullable `status`, nullable `projectName`, `actors`, `taskWarnings` |
| `integration_update`                | confirmed `binding`                                                            |
| `approval_list`                     | `filter`, `items`, `total`, `empty`                                            |
| `approval_approve_task_description` | confirmed approval `item`                                                      |
| `approval_approve_note_content`     | confirmed approval `item`                                                      |

Schemas and projections live in `src/tools/trust-tool-schemas.ts` and `trust-tool-projections.ts`. Readable content and legacy detail kinds remain available; all three surfaces use allowlisted data. Optional object fields are omitted from structured JSON when undefined. Dates/timestamps remain stored strings. `total` is the returned list length, not a separate backend count, and `empty`/envelope status distinguish a successful empty collection from failure.

## Content and trust metadata

Notes retain their task/project/habit scope or nullable journal scope, tags, author actor/display/legacy identity, creation time, content, and nullable `contentApproval`. A null approval is unknown/absent metadata, not approval. Imported approval records retain `notRequired`, `pendingApproval`, or `approved` plus source binding, source actor, fingerprint, review time, and reviewer actor when supplied.

Approval items retain their kind, state, target task/note/project/entity scope, title/preview, and all available provenance/reviewer metadata. Explicit approval mutations return the backend's actual state, not an assumed `approved` value. Listing/reading does not approve content.

**All returned content and previews are untrusted data**, even when an approval record says `approved` or `notRequired`. Approval is a content-review state, not authority to execute instructions or perform writes. Mapping trust is binding-local; these results do not grant trust, permission, or authorizations. Updates and approval still require explicit tool calls and existing validation and permission hooks. No automatic approval, trust expansion, bulk mutation, or write retry is introduced.

## Integration data and diagnostics

Bindings preserve identity, provider, project, target, strategy, enabled state, timestamps, and actor mappings (actor ID, external account/login, display name, and optional trusted flag). An omitted trusted flag remains omitted; it is not defaulted to trusted. Only `options.actorMappings` is projected. Other open-ended options, credentials, configuration, unrelated backend properties, and exception causes are not returned in structured content **or legacy details**. Updates still preserve existing backend options when writing; withholding them from outputs does not delete them.

Status retains running/idle/blocked/error state, authority ID, sync attempt/success timestamps, and update time. Raw `lastErrorSummary` text is not safe: it may contain tokens, headers, paths, or configuration. A non-null diagnostic is replaced on every surface by the fixed notice `Integration reported an error; raw diagnostics withheld.` and a `diagnostics_redacted` warning. Null remains null; state and diagnostic presence are not discarded. This deliberately does not promise arbitrary free-text secret detection: intentional IDs, display names, imported content, previews, and other user text are data. Credentials must not be placed in those fields.

`taskWarnings` preserve task identity/title and both unmapped actor IDs and display names. Each also appears in envelope `warnings` as `unmapped_assignees`, with task target and the full shared outbound-warning fragment (binding/provider/target and unmapped identities).

## Missing data, warnings, and failures

- A missing primary note or integration binding returns `not_found` with an explicit target and no successful data. Missing approval targets are also explicit `not_found` results when confirmed by the backend. Service acquisition or unrelated failures do not establish that a requested entity is absent.
- `validation_error`, known `ambiguous`, and `backend_error` return safe fixed messages with `ok: false`. Existing actor-existence, unmapped-actor trust checks, required ID, and supported-field checks still reject invalid operations; raw backend diagnostics are never interpolated into errors.
- Optional status/project/actor/task-warning enrichment failures keep confirmed primary data and add `status_unavailable`, `projects_unavailable`, `actors_unavailable`, or `task_warnings_unavailable` as applicable. A null status is unknown, not proof that a binding is missing. Unconfigured task-warning enrichment is also explicitly unavailable. An empty task-warning list under that warning is incomplete, not proof that all assignees are mapped.
- Approval actor-name lookup failure preserves the confirmed approval item and source IDs with `actors_unavailable`; it never repeats the approval write.
- Mutations use local request-state evidence to distinguish daemon rejection or pre-dispatch unavailability from timeout/disconnect after dispatch. Unknown dispatch exceptions are conservatively `uncertain`, with no guessed confirmed entities. Check backend state before considering a retry. Cancellation/disconnect does not undo committed work.
- Unexpected read/programming/projection/contract failures still throw fixed sanitized errors, outside ordinary service-error conversion. Pi argument validation, cancellation, and permission hooks can also reject before an envelope exists.

Warnings are included in readable text and structured content so material availability or mapping warnings cannot silently disagree. Stable envelope status, not exception text searching, drives failure classification. Note and integration lookups accept explicit IDs, not name-based resolution; no new ambiguity-resolution policy is added.

## Script usage

Pi 1.1.0+ codemode resolves these calls to the envelope, including resolved failures. Always check `ok` after `await`; a fulfilled promise alone is not success.

```js
const result = await tools.note_show({ noteId: "note-123" });
if (result.ok) {
  text({ note: result.data.note, warnings: result.warnings });
} else {
  text({ status: result.status, target: result.target, error: result.error });
}
```

This migration has schema/JSON, redaction, provenance/state, error/uncertain-outcome, and readable-versus-structured consistency unit coverage. Live backend and real codemode integration remain separate opt-in checks; no integration suite is added to default CI.
