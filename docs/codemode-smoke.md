# Opt-in task-read codemode compatibility smoke

## Run

From a checkout with dependencies installed:

```bash
npm install
npm run smoke:codemode
```

The command rebuilds the packaged `dist/index.js` entrypoint, then runs the isolated harness. It is separate from `npm test`, `make check`, `scripts/pre-pr.sh`, and default CI. The scripts are development tooling, not part of the published `dist` package.

Prerequisites: Node.js 22.19.0+, installed stable Pi SDK 1.1.0+ within 1.x, and POSIX Unix-domain sockets. Windows is rejected before creating fixture state. Dependencies must already be installed; the smoke itself requires neither a Todu CLI/real daemon nor provider credentials, a downloaded model, or external network access. Dependency installation can require network access.

## What really executes

The worker imports the compiled package's default factory from `dist/index.js` and supplies it to the documented Pi SDK `DefaultResourceLoader.extensionFactories` boundary. It also loads Pi's public `createCodemodeExtension()` and a fixture observer. A deterministic local provider emits actual model tool-call stream events into `createAgentSession()`; it does not call an LLM service or interpret task content.

Direct reads are top-level model-issued calls through Pi's agent/tool lifecycle, not raw calls to a mocked `execute()` function. Nested reads execute JavaScript in Pi's real QuickJS codemode sandbox and call the packaged tools through `ctx.executeTool()`. The package's real connection/client/service/mapping/result layers communicate with a local Unix-socket RPC fixture.

The fixture is deliberately not a production Todu engine. It implements only the read RPCs needed for these cases and synthetic data/failures. Live SDK tool invocations are limited to `task_list`, `task_show`, and `codemode`; the observer additionally rejects any other tool. No destructive or trust-changing operation is used to test policy enforcement.

## Isolation and teardown

- The launcher creates a fresh private `todu-cm-XXXXXX` directory and accepts no caller-supplied state directory.
- The SDK worker is a separate Node process with a new environment. Only optional `PATH` is retained; provider credentials, Node preload options, normal Pi/Todu overrides, proxy settings, and session metadata are not forwarded.
- Home, XDG paths, working directory, Pi agent/cache paths, Todu config/data paths, and both current/legacy daemon-socket overrides point inside the fresh root. macOS's automatically added locale/encoding marker is permitted by the environment guard; no credential variables are permitted.
- Guards run before importing Pi/package code. The loader disables discovered extensions, skills, prompts, themes, and context files; only the three explicit factories load. Settings and sessions are in memory, credentials use an empty in-memory store, and model configuration files/catalog network refresh are disabled. Pi offline/version-check/telemetry settings are explicit.
- Every script has a 20-second deadline; the launcher caps the whole worker at 90 seconds. On normal completion or assertion failure, the worker aborts its session, resets the package's owned controllers/runtime, disconnects the client, disposes the SDK session, and closes the socket server. The parent removes its own temporary root after the worker exits, including timeout/failure paths.
- Isolation covers this trusted harness's configuration/state choices, not arbitrary malicious dependency code or an OS/network sandbox. The initial local build uses the ordinary checkout environment.

The harness does not read or modify normal Todu tasks, normal Pi settings/auth/session files, or project dev-daemon state. Normal application permission extensions are not loaded or changed; the harmless fixture hook exists only in the worker.

## Verified cases

| Case                  | Assertion                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct list/detail    | Closed output schemas and JSON round trips; readable text and compatible `details`                                                                     |
| Parallel nested lists | Actual overlapping execution events; status/query/label filtering, merging, deduplication by ID, canonical date-only ordering with nulls last          |
| Returned dates        | Due/scheduled null semantics and exact offset/precision preservation for all four date fields                                                          |
| Detail metadata       | Description/comment approval and provenance, actor identity, outbound warnings, and a result-hook warning visible inside the script                    |
| Empty/missing         | Empty is a successful zero-length list; confirmed missing task is `not_found`, not an error or empty collection                                        |
| Failed reads          | Injected backend failures produce safe `backend_error` envelopes, not absence/empty data; synthetic private diagnostics stay out of results            |
| Invalid input         | Blank task ID produces `validation_error`                                                                                                              |
| Resolved failures     | `Promise.allSettled()` fulfills for structured error envelopes; callers must inspect `ok`                                                              |
| Hook enforcement      | A real, existing fixture task is denied by `tool_call`; the nested promise rejects and no RPC reaches the daemon                                       |
| Correlation           | Nested hook/execution IDs use the parent prefix; parent `nestedCalls` records are complete; nested results do not become standalone transcript entries |

The scripts explicitly assert they receive objects before accessing task data. Only codemode's designated single JSON output item is parsed by the outer harness; human-readable task text is never parsed to obtain task data.

## Actual compatibility findings

Verified locally against **Pi 1.1.0, Node.js v26.10.0, macOS**:

- Pi's public SDK codemode extension runs the real sandbox without external inference when driven by a local scripted provider.
- Task envelopes survive nested execution and hook transformation. Known read errors still resolve to their structured envelopes even though the underlying tool reports `isError: true`.
- Policy-blocked reads without a structured result reject instead. Their parent correlation remains available.
- Allowed nested reads traverse both call/result hooks. Their results reach the calling script; the transcript stores bounded call records on the parent rather than standalone nested results.
- A single returned object produces a codemode status-header text block plus a JSON output text block.
- The fixture handshake uses protocol version string `"1"`; integration enrichment uses `integration.list`, not `integration.binding.list`.
- SDK `session.dispose()` does not emit the package's shutdown event in this baseline, so the harness explicitly tears down the package-owned resources before disposal.

The local Homebrew Node 22 binary could not start because a required simdjson dynamic library was missing. Therefore Node 22 smoke compatibility was **not** verified in this run; no global runtime/library repair was attempted. Linux/Windows, external model providers, npm-installed tarball loading/module mapping, real Todu engine/sync semantics, arbitrary permission extensions, cancellation behavior, and performance are not validated by this smoke.

Do not interpret successful fixture execution as approval to bypass production hooks, trust imported content, or broaden access. See [structured task outputs](task-read-outputs.md) and [shared contract safeguards](tool-result-contracts.md).

## Output and failures

A successful command prints `PASS` lines for each case, a compatibility summary, and confirmation that the isolated worker exited and temporary state was removed. Any failed assertion, unsupported baseline/platform, blocked environment guard, worker timeout, or teardown error makes the command non-zero. Diagnostic output is restricted to synthetic fixture checks; no stack traces or inherited environment values are intentionally logged.

Pure isolation/version/RPC-dispatcher unit tests live alongside the helpers and run under Vitest without opening sockets or loading Pi sessions. The SDK/QuickJS/socket smoke runs only through `smoke:codemode`. No integration tests or opt-in command were added to default branch-push/PR CI.
