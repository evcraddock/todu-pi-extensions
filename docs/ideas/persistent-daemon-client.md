# Idea: persistent todu daemon client for the pi extension

## Summary

The pi extension should likely integrate with todu more like the Electron app than the CLI.

That means:

- reuse the same daemon-first architecture as the rest of todu
- connect to the local todu daemon over its RPC socket
- keep a persistent connection for the lifetime of the pi session
- subscribe to daemon events so the extension can react to external changes

This is not a short-term workaround idea. It is a candidate long-term architecture direction.

## Why this came up

The CLI and Electron app both appear to be daemon-first clients.

### CLI shape

The CLI is effectively a thin client:

- resolve config and data dir
- resolve daemon socket path
- connect over RPC
- make a request
- format output
- exit

This is a good fit for command execution, but not for a long-lived pi session.

### Electron shape

Electron keeps a persistent daemon connection and behaves more like an always-on interactive client:

- establish a long-lived connection to the daemon
- perform the `daemon.hello` handshake
- subscribe to daemon events
- reconnect automatically after daemon restarts
- refresh UI state when daemon state changes

That is much closer to how a pi extension would behave during a real coding session.

## Why a persistent connection fits pi better

A pi extension is also a long-lived interactive client.

Users may:

- keep pi open for a long time while coding
- switch between browsing tasks and normal chat
- expect task context to stay current during the session
- update tasks from another client while pi remains open
- restart the daemon while pi is still running

A persistent connection would let the extension:

- keep current task context warm
- react to external task changes
- surface sync/connectivity state in the UI
- recover automatically after daemon restarts

## Real-world example

### Working a task in pi

1. user runs `/tasks`
2. extension fetches task data from the daemon
3. user picks a task and sets it as the current task
4. extension shows lightweight persistent context in pi:
   - footer status
   - small widget above the editor
5. user continues normal chat-based coding work

### Then something changes outside pi

Examples:

- the user updates the same task from another shell
- the Electron app changes task status
- sync updates the task from another machine

If the extension has a persistent daemon connection and event subscription:

- daemon emits `data.changed`
- extension receives it immediately
- extension refreshes the current task
- footer/widget update automatically
- open task views can refresh in place

Without a persistent connection, pi would only discover the change after a manual refresh.

### Daemon restart case

If the daemon restarts while pi stays open:

- extension notices disconnect
- marks daemon state as unavailable or reconnecting
- retries with backoff
- reconnects
- performs `daemon.hello`
- re-subscribes to events
- refreshes current task and sync state

This is the kind of behavior expected from a long-lived interactive client.

## Suggested architecture

### Reuse CLI conventions where they help

The extension should probably reuse the CLI's conventions for:

- config discovery
- data dir resolution
- daemon socket path resolution
- protocol version compatibility expectations

### Follow Electron's client architecture

The extension should probably follow Electron's structure for the actual client model:

1. **Daemon connection manager**
   - own the socket connection
   - send requests
   - track connection state
   - reconnect automatically
   - subscribe to daemon events

2. **Daemon-backed todu client**
   - wrap raw RPC methods into typed operations
   - expose a higher-level client API for tasks/projects/notes/etc
   - map transport/protocol failures into domain-level errors

3. **pi extension service layer**
   - current task context
   - task browser/detail flows
   - widgets and status lines
   - UI refresh on daemon events

## Responsibilities by layer

### todu daemon

Source of truth for:

- tasks
- notes
- sync state
- runtime status

### pi extension

Session-local state for:

- current task ID
- current filter/project context
- connection state
- small local cache for the current task or visible list if useful

The pi extension should not become the source of truth for task data.

## Why not just mimic the CLI directly?

The CLI's transport pattern is optimized for isolated commands.

That pattern is not ideal for a pi extension because the extension is expected to:

- stay loaded for the whole session
- keep UI context alive between interactions
- react to changes while the user keeps chatting
- survive daemon restarts cleanly

The extension can still borrow config/path conventions from the CLI, but its runtime model should likely look more like Electron.

## Candidate event-driven behaviors for pi

If the daemon exposes these signals reliably, the pi extension could:

- refresh the current-task widget when `data.changed` arrives
- refresh cached task detail after mutations from other clients
- surface sync status changes in a footer/status line
- show reconnect/disconnect state when the daemon becomes unavailable

## Candidate future package shape

Long term, it may be worth extracting a shared daemon client package that can be reused by:

- CLI
- Electron
- pi extension

Example idea:

- `@todu/daemon-client`

That package could own:

- socket resolution helpers
- request/response transport
- persistent connection manager
- event subscription helpers
- daemon-backed typed client wrappers

This would reduce duplicated client logic across todu clients.

## Current recommendation

For long-term architecture, prefer this direction:

- model the pi extension after Electron's daemon-backed client architecture
- reuse CLI config and socket resolution conventions
- treat the extension as a persistent interactive daemon client, not a one-shot command runner

## Open questions

- Should the first version subscribe to daemon events immediately, or start with persistent request capability only?
- Which daemon events are stable enough to depend on for UI refresh?
- Should the pi extension maintain a local cache, or always refetch current task/list views after events?
- Should a shared `@todu/daemon-client` package be extracted before building extension integration?
