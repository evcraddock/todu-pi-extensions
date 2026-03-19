# Todu skills to agent tools migration

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#command-and-tool-boundaries
Related tasks: task-a4ac681c, task-d6ae16f2, task-77d71043, task-2bec9ed4, task-98a5a796, task-068cdeb7
Last updated: 2026-03-19

## Problem

`todu-pi-extensions` currently focuses on slash-command-driven task workflows. The separate `todu-skills` package still carries most of the operation-oriented task, project, habit, and recurring behaviors as prompt-time skills that teach the agent how to run CLI commands.

That split creates duplicated concepts and an awkward boundary:

- slash commands own the user-facing TUI flows inside pi
- `todu-skills` owns many of the agent-facing CRUD operations outside the extension runtime
- the same backend concepts are described twice, once as extension architecture and once as CLI-oriented skill recipes

The architecture already says commands and tools should share a service layer, with commands owning user-driven interaction and tools exposing small composable operations to the LLM. This plan captures how to move as much of `todu-skills` as practical into native pi extension tools without dragging `todu-workflow` into the same migration.

## Goal

Define a phased migration path that converts operation-oriented `todu-skills` behaviors into native pi extension tools backed by the extension's daemon-first service layer.

### Success criteria

- [ ] The current `todu-skills` inventory is grouped into clear migration waves.
- [ ] Each skill is classified as direct tool candidate, deferred candidate, or out of scope for this repository.
- [ ] The first migration wave is bounded tightly enough to become implementation tasks.
- [ ] Later waves identify the missing service and domain work required for parity.
- [ ] The plan keeps `todu-workflow` style orchestration out of scope.

## Non-goals

This plan does not try to:

- replace `todu-workflow` skills such as preflight, close gate, PR review, or task pipeline
- remove the existing `todu-skills` package immediately
- guarantee one-to-one behavioral parity with every existing skill prompt on day one
- redesign the slash-command UI flows that already exist in this repository
- cover non-todu packages such as `rott` skills

## User-facing behavior

The intended long-term behavior is a layered model:

- slash commands continue to own explicit user-invoked TUI flows such as `/tasks` and `/task-new`
- native pi tools expose backend operations directly to the model when the user asks for them in normal chat
- higher-level workflow skills remain available for policy and orchestration where a simple tool is the wrong abstraction

### Entry points

Planned entry points involved in this migration:

- `src/extension/register-tools.ts`
- future tool modules under `src/tools/` or equivalent
- existing slash commands, which remain unchanged as the primary direct UI entrypoints
- existing service abstractions under `src/services/`

### Main flow

1. The user asks for a task, project, habit, or recurring operation in normal chat.
2. The model calls a native pi tool instead of relying on a skill that shells out to `todu`.
3. The tool uses the same daemon-backed service layer as the slash commands where possible.
4. The tool returns structured results and optional tool details for rendering.
5. Workflow-oriented skills remain available for gated multi-step processes that should not become raw tools.

### Error, empty, and cancel states

- Tools should return structured, contextual failures rather than vague text blobs.
- Empty list results should be explicit and non-error.
- Tool behavior should not depend on interactive TUI cancellation unless a later tool deliberately uses `ctx.ui`.

### Non-interactive behavior

Native tools are primarily LLM-facing and should work in both interactive and non-interactive pi modes, subject to normal backend availability.

## Technical approach

### Migration classification

The current `todu-skills` package breaks down into these likely buckets.

#### Wave 1: direct candidates backed by current task/project services

- `task-list`
- `task-show`
- `task-create`
- `task-update`
- `task-comment-create`
- `project-list`

These align best with the current extension architecture and existing `TaskService` capabilities. They should follow the explicit V1 contract captured in `docs/plans/agent-tools-v1.md`, including domain-first naming, UI-neutral behavior, and stable structured `details` payloads.

#### Wave 2: task/project parity candidates after service expansion

- `task-delete`
- `task-move`
- `project-check`
- `project-register`
- `project-update`
- `project-delete`

These are still good tool candidates, but the current extension service layer does not yet expose the needed delete, move, project mutation, or integration-binding operations.

#### Wave 3: habit and recurring candidates after new domain support

- `habit-create`
- `habit-list`
- `habit-update`
- `habit-check`
- `habit-delete`
- `recurring-create`
- `recurring-list`
- `recurring-update`
- `recurring-delete`

These appear tool-friendly, but they need new domain models, service interfaces, daemon client wrappers, and tests inside this repository before migration is realistic.

### Affected areas

Likely files and modules across the migration:

- `src/extension/register-tools.ts`
- new tool definitions under `src/tools/`
- `src/services/task-service.ts`
- `src/services/todu/daemon-client.ts`
- `src/services/todu/todu-task-service.ts`
- possible future service modules for project integration, habits, and recurring templates
- tests for tool registration, execution, and result formatting

### Data and state

Migration should follow the existing architecture decisions:

- use the extension's daemon-backed client instead of shelling out to the CLI as the primary runtime path
- share service contracts between commands and tools where possible
- persist only lightweight reconstructable UI context, not backend truth
- prefer structured tool results and optional `details` payloads over brittle plain-text parsing

### Testing approach

Expected coverage across the migration:

- focused unit tests for tool registration, parameter mapping, and service delegation
- formatter and error-path tests for tool outputs
- manual verification for prompt-guideline behavior where needed
- no default CI integration-test expansion unless explicitly requested later

## Open questions

Resolved decisions for the first migration waves:

- [x] Tool names should follow the architecture's domain-first `task_list` / `project_list` style rather than the Electron app's `list_tasks` style.
- [x] The migration may fold adjacent skills into a smaller normalized tool surface, but should still keep one tool per core operation rather than using one mega-tool with an action enum.
- [x] V1 tools should stay mostly UI-neutral. Slash commands remain the primary UI layer, while tools focus on service-backed operations, structured results, and optional custom rendering.

Intentional deferrals:

- `todu-workflow` skills remain out of scope
- immediate removal of `todu-skills` remains out of scope until replacement tools are proven

## Task breakdown candidates

1. **Define first-wave agent tool contract**
   - settle naming, prompting, and output conventions for native pi tools
   - success criteria: a bounded V1 tool set can be specified clearly
2. **Implement task/project V1 tools**
   - add native tools for the current task/project service surface
   - success criteria: the model can perform common task lookups and simple mutations without external skills
3. **Expand task/project backend coverage**
   - add service support for move, delete, and project mutations or integration checks
   - success criteria: second-wave task/project skills become toolable
4. **Add habit and recurring service domains**
   - introduce domain models and daemon-backed services for habits and recurring templates
   - success criteria: third-wave skills become tool candidates
5. **Plan deprecation path for overlapping `todu-skills` entries**
   - decide how and when overlapping skills should be retired or left as compatibility shims

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
- `src/services/todu/daemon-client.ts`
- `../todu/packages/electron/src/main/tools.ts`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/`
