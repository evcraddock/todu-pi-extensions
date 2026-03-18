# todu-pi-extensions architecture design

## Purpose

This document captures the initial architecture for `todu-pi-extensions`: a pi package that adds task-oriented workflows and TUI interactions to the pi coding agent harness.

The goal is to keep the first implementation small and aligned with documented pi extension patterns while leaving room for richer task workflows later.

## Scope and constraints

### In scope

- define the extension and package layout
- identify the core task interaction flows inside pi
- define the initial TUI interaction model
- capture the main architectural decisions and tradeoffs
- break the work into follow-up implementation tasks

### Out of scope for the first implementation

- a custom editor replacement
- background sync daemons or long-running local services
- offline caching beyond session-backed UI state
- multiple backend implementations on day one
- inventing new TUI primitives when pi already ships usable ones

## Design rationale

The pi docs and examples point toward a few strong constraints:

- pi extensions are the right integration point for commands, tools, event hooks, status lines, widgets, and custom TUI
- pi packages are the right packaging unit for later sharing through npm or git
- built-in TUI primitives such as `SelectList`, `SettingsList`, `BorderedLoader`, `setWidget`, and `setStatus` are preferred before custom components
- session state should be reconstructable from session entries or tool result details instead of hidden process state
- interactive flows should degrade cleanly when pi runs without a TUI

That led to three main design decisions, with alternatives considered below.

### 1. Package structure

#### Option A: single extension file

Pros:

- fastest path to a working prototype
- minimal boilerplate

Cons:

- task flows, TUI code, backend integration, and state handling would mix together quickly
- hard to test or extend as more task actions are added

#### Option B: single pi package with one extension entrypoint and modular internals

Pros:

- matches pi package conventions already present in `package.json`
- keeps one extension runtime while allowing internal separation by responsibility
- easy to grow into commands, tools, UI, and backend adapters

Cons:

- slightly more upfront structure than a single file

#### Option C: multiple packages or multiple independent extensions immediately

Pros:

- maximum separation of concerns
- could isolate task browsing, task mutation, and task context features

Cons:

- too much coordination cost for an unproven first feature set
- more runtime and packaging complexity than needed right now

**Recommendation:** Option B.

### 2. Task UI model inside pi

#### Option A: slash-command only UI

Pros:

- simple mental model
- easy to discover

Cons:

- no persistent awareness of current task context
- repeated navigation friction

#### Option B: commands plus lightweight persistent context

Pros:

- commands remain the main entrypoint
- footer status and editor widgets can show the active task or queue summary
- aligns with documented pi patterns without replacing the editor

Cons:

- requires explicit state management for what is currently selected

#### Option C: full-screen custom task application inside pi

Pros:

- most powerful and visually cohesive
- could mimic a dedicated task manager

Cons:

- large implementation surface
- higher risk of fighting the normal chat-first pi workflow

**Recommendation:** Option B.

### 3. Task data access model

#### Option A: bind UI directly to one concrete backend implementation

Pros:

- fastest to build

Cons:

- locks the package to one backend shape and makes tests harder

#### Option B: define a task service interface and start with one adapter

Pros:

- keeps UI and workflow code backend-agnostic
- makes tests and later backend swaps easier
- gives a clean seam between pi-facing code and task-system integration

Cons:

- introduces a small abstraction layer early

**Recommendation:** Option B.

## Recommended architecture

### High-level shape

The project should stay as a single pi package with one extension entrypoint in `src/index.ts`. That entrypoint should register commands, tools, event hooks, and UI wiring, but delegate actual behavior to small modules.

```text
src/
  index.ts                  # pi extension entrypoint
  extension/
    register-commands.ts    # slash command wiring
    register-tools.ts       # LLM tool wiring
    register-ui.ts          # widgets, status, message renderers
    register-events.ts      # session/task lifecycle hooks
  domain/
    task.ts                 # task, project, comment, filter types
    task-actions.ts         # supported mutations and flow enums
  services/
    task-service.ts             # backend interface used by UI, tools, commands
    task-session-store.ts       # reconstructable UI/session state helpers
    todu/
      daemon-connection.ts      # persistent daemon connection manager
      daemon-client.ts          # daemon-backed todu client wrapper
      daemon-events.ts          # event subscription and refresh coordination
      daemon-config.ts          # config/data-dir/socket resolution helpers
      todu-task-service.ts      # TaskService backed by persistent daemon client
  flows/
    browse-tasks.ts         # interactive list and selection flow
    show-task-detail.ts     # detail view and quick actions
    create-task.ts          # create flow
    update-task.ts          # status/priority/edit flow
    comment-on-task.ts      # note/comment flow
    pick-current-task.ts    # set active task in session context
  ui/
    components/
      task-list.ts          # SelectList-based task picker wrapper
      task-detail.ts        # detail panel / markdown-ish summary
      task-settings.ts      # SettingsList-based status/priority toggles
      loaders.ts            # BorderedLoader wrappers for async work
    widgets/
      current-task-widget.ts
      next-actions-widget.ts
    renderers/
      task-tool-renderer.ts # custom renderCall/renderResult helpers
  utils/
    task-format.ts
    task-filters.ts
    key-hints.ts
  __tests__/
    ...
```

### Why this shape

- `index.ts` stays small and pi-specific.
- `domain/` holds stable data types that the rest of the package shares.
- `services/` isolates the task backend and session persistence concerns.
- `services/todu/` gives the daemon-backed integration its own boundary so transport lifecycle does not leak into UI flows.
- `flows/` models user-facing workflows instead of mixing navigation logic into commands.
- `ui/` holds reusable TUI pieces that can be shared by commands and tools.
- `extension/` keeps pi registration code separate from implementation details.

## Package layout

### Current package recommendation

Keep the package manifest simple and explicit:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

That is already compatible with pi package loading and is the right default while this repository only ships extension functionality.

### Future-ready package expansion

If the project later grows supporting skills or prompts, the package can expand without changing the overall architecture:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

The first release does not need that extra surface area.

## Core task interaction flows inside pi

The extension should center on a small set of flows that fit pi's normal chat-plus-tools workflow.

### 1. Browse tasks

Goal: quickly find work to do.

Flow:

1. user runs a command such as `/tasks`
2. extension loads tasks through `TaskService`
3. a `SelectList` shows the filtered task list
4. selecting a task opens detail view or sets it as current context

Why it matters: browsing is the entrypoint for nearly every other workflow.

### 2. Inspect task details

Goal: understand the task without leaving pi.

Flow:

1. start from a selected task or explicit ID
2. load full task detail, metadata, and recent comments
3. show a detail panel or modal with quick actions
4. optionally inject a concise task summary into the editor or agent context

Why it matters: pi is chat-first, so the task detail view should help the user transition from task management to agent work.

### 3. Set or change the current task context

Goal: give the active coding session a task anchor.

Flow:

1. user picks a task from browse or detail view
2. extension stores the selection in reconstructable session state
3. status line and widget update to show the current task
4. follow-up commands can default to the current task

Why it matters: this creates continuity without forcing a full-screen task app.

### 4. Update task status and metadata

Goal: make common mutations fast.

Flow:

1. from detail view, user chooses a quick action
2. simple fields such as status, priority, or assignee use `SettingsList` or a selection dialog
3. extension applies the mutation through `TaskService`
4. list/detail/widget state refreshes immediately

Why it matters: status updates are common and should not require leaving pi.

### 5. Add comments or progress notes

Goal: record implementation notes from inside the coding session.

Flow:

1. user chooses comment action from detail view or command
2. extension opens `ctx.ui.editor()` for longer text entry
3. comment is submitted through `TaskService`
4. task detail refreshes and optionally notifies success

Why it matters: comments are a natural bridge between coding progress and task tracking.

### 6. Create a new task

Goal: capture work discovered during a session.

Flow:

1. user invokes a create command
2. extension gathers title and optional details through a compact wizard
3. new task is created through `TaskService`
4. extension offers to open or set the task as current

Why it matters: coding sessions often generate follow-up tasks.

## TUI component and interaction model

### Interaction principles

- keep chat as the center of gravity
- use overlays or temporary custom UI for focused actions
- use persistent widgets only for lightweight context
- prefer documented pi components before building custom ones
- support keyboard-first interaction and respect pi keybindings

### Recommended UI primitives by use case

#### Task selection

Use `SelectList` inside `ctx.ui.custom()`.

Use it for:

- task browsing
- project filtering
- action menus from task detail

Why: pi already documents this as the standard selection pattern, and it is enough for the first browsing experience.

#### Quick setting changes

Use `SettingsList` for small fixed-value toggles.

Use it for:

- status
- priority
- pause/resume style states

Why: it reduces custom UI code and communicates mutability clearly.

#### Async fetch or submit states

Use `BorderedLoader` for network or CLI-backed operations.

Use it for:

- loading task lists
- loading task details
- submitting status updates or comments

Why: documented pattern, built-in cancel behavior, low custom complexity.

#### Current task awareness

Use `ctx.ui.setStatus()` and `ctx.ui.setWidget()`.

Use them for:

- current task title and state in the footer
- a small widget above the editor with task ID, title, and next suggested action

Why: this keeps the current task visible without taking over the interface.

#### Longer text entry

Use `ctx.ui.editor()`.

Use it for:

- comments
- task descriptions
- richer update notes

Why: it fits pi's built-in interaction model better than inventing a custom multiline editor immediately.

### Initial screen model

#### Command entrypoints

Recommended first commands:

- `/tasks` — browse and pick tasks
- `/task` — show the current task or a specific task by ID
- `/task-new` — create a task
- `/task-clear` — clear the current task context

This command set is the initial command surface for the project and keeps the first iteration small and discoverable.

#### Persistent UI elements

- footer status: current task ID and compact state
- widget above editor: one to three lines of current task summary or next actions

#### Temporary UI elements

- overlay or editor replacement for browse/detail flows
- selection dialogs for action menus
- settings dialogs for status and priority changes
- editor dialog for comments and descriptions

### Keyboard model

The extension should lean on pi defaults instead of inventing task-specific key schemes.

Use the documented defaults where possible:

- arrow keys for list movement
- enter for confirm
- escape for cancel
- page up/page down for long lists
- existing expand/collapse behavior for tool output when task tools render details

Custom shortcuts should be added only after the command-driven flows feel stable.

## Planned extension capability areas

The project should be designed as one pi extension package with several capability areas inside it. These are architectural slices, not necessarily separate extension runtimes.

| Capability area              | Primary purpose                                                            | Main extension mechanisms                     | Priority |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| Daemon integration           | Maintain the long-lived todu client connection and daemon event handling   | events, runtime services, status updates      | V1       |
| Task browsing and detail UI  | Let users browse tasks, inspect details, and take quick actions            | slash commands, custom UI, widgets            | V1       |
| Current-task ambient context | Keep the active task visible and session-aware while the user codes        | session state, widgets, footer status, events | V1       |
| Agent-facing task tools      | Let the model interact with todu directly when the user asks for it        | custom tools, tool renderers                  | Later    |
| Task-aware coding context    | Make normal coding chat more aware of the current task and project context | event hooks, prompt/context integration       | Later    |

### Why this split

- it keeps one extension runtime while making the major responsibilities explicit
- it separates user-facing task UI from daemon transport concerns
- it lets agent-facing tools evolve later without forcing them into the first user-facing milestone
- it gives the project a clear path for staging implementation work

## State model

### Session-backed state

The extension should persist lightweight UI state in session entries so that branch navigation, reloads, and forks remain coherent.

Recommended persisted state:

- current selected task ID
- current project/filter context
- maybe the last viewed task ID

This should be reconstructable from session entries rather than hidden globals. That follows the same pattern as pi's `todo.ts` and `tools.ts` examples.

### Service state

Backend data should not be mirrored wholesale into session state. The source of truth for tasks remains the task backend. The extension only persists enough session-local state to restore the user's context.

## Todu integration architecture

### Decision status

This is the architecture decision for todu integration. Implementation details will still be refined, but the direction itself is now part of the source of truth for the project.

### Chosen direction

The pi extension should integrate with todu as a persistent daemon-backed client, following the Electron app's client model more closely than the CLI's one-shot command model.

That means:

- connect to the local todu daemon over its RPC socket
- keep that connection alive for the lifetime of the pi session
- perform `daemon.hello` during connection setup
- subscribe to daemon events and refresh extension state from them
- reconnect automatically after daemon restarts
- re-subscribe and refresh current extension state after reconnect

### Why this is the chosen direction

The pi extension is a long-lived interactive client, not a one-shot command runner.

That makes it closer to Electron than to the CLI:

- the CLI optimizes for connect → request → print → exit
- Electron optimizes for long-lived interaction, reconnects, and event-driven refresh
- pi needs current-task context, widgets, and session-aware UI that can stay warm while the user keeps chatting

### What the extension should reuse from existing todu clients

#### Reuse from CLI

Use the CLI's conventions for:

- config discovery
- data-dir resolution
- daemon socket-path resolution
- protocol version expectations

#### Reuse from Electron

Use Electron's client shape for:

- persistent connection management
- reconnect/backoff behavior
- daemon event subscription
- a daemon-backed typed client wrapper instead of raw RPC calls throughout the codebase

### Intended layering

1. **Daemon connection manager**
   - owns the socket connection
   - sends RPC requests
   - tracks connection state
   - reconnects automatically
   - manages daemon event subscriptions

2. **Daemon-backed todu client**
   - wraps daemon RPC methods into typed operations
   - maps transport and protocol failures into domain-level errors
   - presents a higher-level API to the extension service layer

3. **Task service and pi integration layer**
   - current task context
   - task browsing/detail/update flows
   - widgets and footer status
   - event-driven refresh logic for pi UI

### What this does not mean

- the extension should not shell out to the CLI as its primary long-term integration path
- the extension should not embed `@todu/engine` directly as its primary client path if the intended runtime model is daemon-first
- the extension should not become the source of truth for task data; it should remain a daemon client with session-local UI state

### Consequences accepted by this decision

This direction accepts additional complexity in exchange for better long-term alignment with todu's architecture.

Known costs:

- more connection lifecycle code
- reconnect and re-subscribe logic
- event-driven refresh coordination
- more testing around disconnect/reconnect and stale-state behavior

Those costs are acceptable because the long-term goal is a real first-class todu client inside pi, not a temporary wrapper around existing skills.

### Current event model and client behavior

The current daemon event model is coarse. The extension is designed around that reality instead of waiting for a richer event contract.

Current client behavior:

- subscribe to the daemon events that exist today
- treat `data.changed` as a coarse invalidation signal
- refetch focused or visible state after invalidation
- treat `sync.statusChanged` as a direct sync/status UI update signal

This keeps the extension aligned with the daemon as it exists now while still enabling a persistent daemon-backed client architecture.

### Future improvement path for daemon events

The architecture must support incremental adoption of richer daemon events in the future.

The upgrade path is:

- use today's coarse invalidation events now
- isolate event handling behind the daemon client and service layers
- add more targeted refresh behavior later if the daemon exposes more specific events
- keep backward compatibility with the coarse event model where practical

Improved daemon events are therefore an optimization of refresh precision, not a prerequisite for this architecture.

## Command and tool boundaries

### Commands

Commands should own user-driven interactive flows.

Examples:

- open the task browser
- show current task detail
- create or comment through dialogs

### Tools

Tools should expose task operations to the LLM in small, composable units.

Likely first tools:

- `task_list`
- `task_show`
- `task_set_current`
- `task_update_status`
- `task_comment`

These should call the same `TaskService` used by commands and share formatting/rendering helpers.

### Why both are useful

- commands support direct user interaction and navigation
- tools let the agent participate in task workflows when the user asks for it
- sharing a service layer avoids duplicating backend logic

## Key architectural decisions

### Decision 1: one package, one extension runtime, modular internals

This is the lowest-complexity shape that still scales.

### Decision 2: commands are primary, widgets are supportive

The package should enhance pi's workflow, not replace it with a separate application shell.

### Decision 3: use a backend abstraction from the start

Even if the first adapter targets todu, the UI and flow code should depend on a `TaskService` interface.

### Decision 4: use a persistent daemon-backed todu client as the primary integration path

The extension should follow the Electron-style client model: persistent connection, daemon handshake, event subscription, reconnect, and event-driven refresh. CLI-style one-shot transport remains useful as a reference, but it is not the target runtime model for the extension.

### Decision 5: persist only reconstructable UI context in the session

The session should remember what the user was working on, but task truth should stay with the backend.

### Decision 6: reuse pi TUI primitives before creating custom components

This keeps the first implementation boring, testable, and aligned with pi's documented patterns.

### Decision 7: interactive mode is the primary experience

Non-interactive modes should fail gracefully or no-op for UI-heavy commands, but the first architecture should optimize for interactive pi usage.

## Implementation plan

This work is best approached as a staged build rather than one large feature drop.

### Stage 1: daemon-backed foundation

Deliverable:

- a persistent daemon-backed client foundation inside the extension package

Success criteria:

- daemon config and socket resolution follow existing todu conventions
- connection, handshake, reconnect, and re-subscribe behavior are isolated under `services/todu/`
- a first `TaskService` implementation exists on top of the daemon-backed client
- transport and error handling have focused tests

Planned tasks:

- complete `task-3d758b6a` for local dev flow and testing ergonomics
- introduce the internal module layout in `src/`
- implement daemon connection manager
- implement daemon-backed todu client wrapper
- implement first `TaskService` adapter and tests

### Stage 2: first user-visible task workflow

Deliverable:

- a usable browse-and-focus task workflow inside pi

Success criteria:

- `/tasks` can browse and select tasks
- the user can inspect task detail from the selection flow
- the user can set a current task for the session
- current task context appears in footer status and/or widget
- coarse daemon invalidation events can refresh focused state

Planned tasks:

- implement `/tasks` browse flow with `SelectList`
- implement current-task session state
- implement current-task widget and footer status
- implement task detail and quick actions
- add integration tests for session-aware UI restoration and focused refresh

### Stage 3: task mutation workflows

Deliverable:

- users can update task state from within pi without leaving the session

Success criteria:

- users can add comments or progress notes
- users can update status and other simple metadata through task detail actions
- users can create a follow-up task from within pi
- detail and current-task views refresh correctly after mutations

Planned tasks:

- implement comment and note flow with `ctx.ui.editor()`
- implement status and metadata quick actions
- implement create task flow
- harden refresh behavior after mutation success

### Stage 4: agent-facing integration

Deliverable:

- the model can participate in todu workflows through extension tools

Success criteria:

- read-heavy task tools exist first
- tool output and rendering match the main task-service contracts
- mutation tools are only added after user-driven flows are proven

Planned tasks:

- add `task_list` and `task_show`
- add `task_set_current`
- add mutation tools such as comment or status update only after validating command-driven flows

## Initial implementation tasks

### Foundation backlog

1. **Set up dev environment**
   - complete `task-3d758b6a`
   - make local extension testing and reload loops easy

2. **Introduce the internal module layout**
   - split `src/index.ts` into extension, domain, service, flow, and UI modules
   - add initial shared types and test scaffolding

3. **Define `TaskService` and implement the daemon-backed foundation**
   - create the backend interface
   - add a persistent daemon connection manager
   - add a daemon-backed todu client wrapper
   - add the first `TaskService` implementation on top of that client
   - add unit tests around mapping, reconnect behavior, and error handling

### First user-visible backlog

4. **Implement `/tasks` browse flow**
   - load tasks through the service
   - render a `SelectList`
   - support selection and cancellation

5. **Implement current task session state**
   - persist current task ID in session entries
   - restore it on session start, tree navigation, and fork
   - show current task in footer status and widget

6. **Implement task detail and quick actions**
   - open detail view from selection
   - expose actions for set current, update status, and comment

### Follow-up backlog

7. **Implement comment and note flow**
   - use `ctx.ui.editor()` for long-form text
   - refresh detail after submission

8. **Implement create task flow**
   - compact wizard for title plus optional details
   - optionally set new task as current

9. **Add LLM-facing task tools**
   - start with read-heavy tools first
   - add mutation tools after command flows are proven

10. **Add integration tests for session-aware UI state**

- reload, fork, and tree-navigation behavior
- current task restoration

## Risks and mitigations

### Risk: UI becomes too custom too early

Mitigation: stay with `SelectList`, `SettingsList`, `BorderedLoader`, widgets, and dialogs for the first pass.

### Risk: backend assumptions leak into the UI

Mitigation: require all UI and tool code to depend on `TaskService` contracts and domain types only.

### Risk: persistent connection lifecycle becomes fragile

Mitigation: isolate daemon transport code under `services/todu/`, test reconnect and re-subscribe behavior directly, and keep UI refresh logic separate from low-level transport state.

### Risk: task context drifts across branches or reloads

Mitigation: persist only small, explicit session entries and reconstruct on `session_start`, `session_tree`, and `session_fork`.

### Risk: task workflows overwhelm the chat UI

Mitigation: keep persistent UI compact and make every larger interaction explicitly command-driven.

## References reviewed

### Pi docs

- `README.md`
- `docs/extensions.md`
- `docs/tui.md`
- `docs/packages.md`
- `docs/sdk.md`
- `docs/session.md`
- `docs/keybindings.md`

### Pi examples

- `examples/extensions/todo.ts`
- `examples/extensions/tools.ts`
- `examples/extensions/qna.ts`
