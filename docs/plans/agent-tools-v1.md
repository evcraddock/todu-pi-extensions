# Agent tools v1

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#command-and-tool-boundaries
Related tasks: task-a4ac681c, task-d6ae16f2, task-77d71043, task-2bec9ed4
Last updated: 2026-03-19

## Problem

The architecture says tools should expose small composable task operations to the LLM, but `todu-pi-extensions` currently does not register any agent-facing tools at all. `src/extension/register-tools.ts` is still a placeholder.

That leaves a gap between the current slash-command UX and the desired extension shape:

- users can drive task workflows directly through commands and TUI dialogs
- the model cannot call equivalent native operations inside the extension runtime
- overlapping `todu-skills` entries still carry the agent-facing behavior through external skill prompts instead of shared extension services

A first native tool wave should focus on operations the repository can already support through its daemon-backed task and project service layer.

## Goal

Add a small first wave of native pi tools for task and project operations that overlap cleanly with the current `todu-skills` package and fit the existing `TaskService` contracts.

### Success criteria

- [x] The V1 tool scope is bounded to operations supported by the current service layer.
- [x] Tool behavior is defined clearly enough to derive implementation tasks.
- [x] The plan keeps slash commands as the primary user-facing UI entrypoints.
- [x] The first wave covers the highest-value task/project skills that do not require new backend domains.
- [x] Error and empty-result behavior are specified.

## Non-goals

V1 should not attempt to:

- replace slash commands such as `/tasks` or `/task`
- add task delete, task move, or project registration flows that need new service support
- add habit or recurring tools
- add workflow-orchestration behaviors from `todu-workflow`
- introduce default-branch integration tests

## User-facing behavior

These tools are not slash commands. They are LLM-callable extension tools that the model may use when the user asks for task or project operations in normal chat.

### Entry points

Planned V1 tools:

- `task_list`
- `task_show`
- `task_create`
- `task_update`
- `task_comment_create`
- `project_list`

V1 should use one consistent domain-first snake_case convention such as `task_list` and `project_list`, matching the architecture examples.

### Main flow

1. The user asks to list, inspect, create, update, or comment on tasks or to list projects.
2. The model calls the matching native pi tool.
3. The tool delegates to the existing daemon-backed task/project service layer.
4. The tool returns structured text plus tool details suitable for future custom rendering.
5. If the user wants richer navigation or interactive editing, slash commands remain available as the direct UI path.

### Error, empty, and cancel states

- List tools should return explicit empty results without treating them as errors.
- Read and mutation failures should include contextual error messages derived from the service layer.
- `task_show` should return a clear not-found result when the task is missing.
- Mutation tools should fail fast on invalid inputs rather than guessing.
- V1 tools should not open custom interactive dialogs, so there is no TUI cancellation path beyond normal tool interruption.

### Non-interactive behavior

The V1 tools should work in both interactive and non-interactive pi modes because they do not depend on custom TUI flows.

## Technical approach

### V1 contract decisions

#### Tool registration conventions

- keep business logic out of `src/extension/register-tools.ts`
- register V1 tools from small named modules under `src/tools/`
- use `pi.registerTool()` with documented pi extension patterns only
- use `Type.Object(...)` for parameter objects and `StringEnum(...)` for string enums
- keep one tool per core operation rather than one mega-tool with an action enum

#### Parameter contract

Use repository-style field names that match the current service layer rather than generic Electron-style `id` fields where a domain-specific name is clearer.

Planned V1 parameters:

- `task_list`
  - `statuses?: TaskStatus[]`
  - `priorities?: TaskPriority[]`
  - `projectId?: string | null`
  - `query?: string`
- `task_show`
  - `taskId: TaskId`
- `task_create`
  - `title: string`
  - `projectId: string`
  - `description?: string`
- `task_update`
  - `taskId: TaskId`
  - `title?: string`
  - `status?: TaskStatus`
  - `priority?: TaskPriority`
  - `description?: string`
- `task_comment_create`
  - `taskId: TaskId`
  - `content: string`
- `project_list`
  - no filter parameters in V1

Deferred from V1 even if other clients support them:

- task labels on `task_create`
- due dates, scheduled dates, and label updates on `task_update`
- all delete, move, integration, habit, and recurring operations

#### Result and `details` contract

All V1 tools should:

- return concise human-readable text in `content`
- return structured `details` objects intended for rendering and future state reconstruction
- avoid returning raw backend payload dumps as the primary user-facing text

Recommended `details` shapes:

- `task_list`
  - `{ kind: "task_list", filter, tasks, total, empty }`
- `task_show`
  - `{ kind: "task_show", taskId, found, task? }`
- `task_create`
  - `{ kind: "task_create", input, task }`
- `task_update`
  - `{ kind: "task_update", input, task }`
- `task_comment_create`
  - `{ kind: "task_comment_create", taskId, comment }`
- `project_list`
  - `{ kind: "project_list", projects, total, empty }`

The exact TypeScript interfaces can be defined during implementation, but the shape should stay stable enough that renderers and tests do not have to infer intent from plain text.

#### Error contract

V1 should use pi's normal tool failure semantics:

- throw errors for validation, service, and backend failures so the tool result is marked as an error
- use contextual error messages that include the operation name
- treat empty lists as successful non-error results
- treat `task_show` not-found as a successful, explicit not-found result rather than a thrown error

#### `promptSnippet` and `promptGuidelines` conventions

Initial V1 policy:

- provide a short `promptSnippet` for every V1 tool so the default system prompt exposes the tool surface clearly
- use `promptGuidelines` sparingly and only for rules that reduce misuse
- keep shared guidance consistent across tools instead of writing a different policy voice for each one

The initial guideline set should reinforce that:

- tools are for backend operations, not interactive browsing flows
- slash commands remain the right choice for rich TUI navigation and editing
- `task_update` supports only title, status, priority, and description in V1
- `task_create` requires explicit `projectId`

#### UI-neutrality contract

V1 tools should stay mostly UI-neutral:

- do not call `ctx.ui.input()`, `ctx.ui.editor()`, or `ctx.ui.custom()` inside tools
- do not change current-task context or other session-backed UI state
- do not switch views or send follow-up slash commands as a side effect
- optional `renderCall` and `renderResult` functions are allowed because they only affect presentation

### Affected areas

Likely files and modules:

- `src/extension/register-tools.ts`
- new tool definitions under `src/tools/`
- `src/services/task-service.ts`
- `src/services/todu/default-task-service.ts`
- existing flow modules where reuse helps keep tool handlers boring
- new tests for tool registration and execution

### Data and state

V1 should reuse the current task/project service surface as the source of truth.

Current service capabilities already available:

- list tasks
- get task detail
- create task
- update task title, status, priority, and description
- add task comment
- list projects
- get project summary

That means V1 can overlap safely with these `todu-skills` entries:

- `task-list`
- `task-show`
- `task-create`
- `task-update`
- `task-comment-create`
- `project-list`

Recommended V1 behavior per tool:

- `task_list`
  - accepts structured task filters aligned with `TaskFilter`
  - returns task summaries with project names when available
- `task_show`
  - accepts a task ID
  - returns full task detail with comments
- `task_create`
  - accepts title, required project ID, and optional description
  - defers labels for V1 even if the backend can support them
- `task_update`
  - supports only the currently implemented update surface: title, status, priority, and description
  - explicitly defer unsupported task fields rather than widening the contract implicitly
- `task_comment_create`
  - accepts task ID and comment content
  - returns created comment metadata
- `project_list`
  - returns project summaries
  - starts unfiltered in V1

The tool layer should not mirror the old skills' CLI recipes. It should call the extension's service abstractions directly and use the shared V1 contract decisions above as the default implementation shape.

### Prompting and rendering

V1 should use documented pi tool features:

- register tools through `pi.registerTool()`
- provide `promptSnippet` and `promptGuidelines` where they materially improve tool selection
- return structured `details` payloads so future custom rendering can evolve without changing backend behavior

V1 tools should stay mostly UI-neutral:

- no custom dialogs or interactive prompts inside tools
- no implicit view switching or current-task changes as tool side effects
- custom renderers are optional, but plain tool output is acceptable if it is concise and consistent

### Testing approach

Expected V1 coverage:

- unit tests for tool registration
- execution tests for parameter mapping and service delegation
- error-path tests for not-found and service failures
- no new default integration-test requirement

Manual verification can confirm that the model sees and uses the tools appropriately once registered.

## Open questions

Resolved decisions:

- [x] V1 should focus only on task/project operations that the current service layer already supports.
- [x] Slash commands remain the primary user-facing flows; tools are additive.
- [x] Unsupported mutations such as delete, move, and project registration are deferred.
- [x] `project_list` should start unfiltered in V1.
- [x] `task_create` should defer labels in V1.
- [x] V1 tool names should use the architecture-style `task_list` naming convention.
- [x] Adjacent historical skills may be folded into one normalized tool per core operation.
- [x] V1 tools should stay mostly UI-neutral.

Intentional deferrals:

- `task_delete`
- `task_move`
- `project_check`
- `project_register`
- `project_update`
- `project_delete`
- all habit and recurring tools

## Task breakdown candidates

1. **Define the V1 tool contract**
   - settle final tool names, parameters, and output shapes
   - success criteria: each V1 tool has a clear contract and deferred fields are explicit
2. **Implement task read tools**
   - add `task_list` and `task_show`
   - success criteria: the model can list tasks and inspect a task through native tools
3. **Implement task mutation tools**
   - add `task_create`, `task_update`, and `task_comment_create`
   - success criteria: the model can perform the supported create/update/comment operations through native tools
4. **Implement `project_list`**
   - expose project summaries to the model
   - success criteria: the model can discover projects without relying on external skills
5. **Add focused tests and tool output polish**
   - cover registration, mapping, and failures
   - success criteria: new tools are verified and easy to reason about

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
- `src/extension/register-tools.ts`
- `src/services/task-service.ts`
- `src/services/todu/default-task-service.ts`
- `src/services/todu/daemon-client.ts`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/task-list/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/task-show/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/task-create/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/task-update/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/task-comment-create/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-list/SKILL.md`
