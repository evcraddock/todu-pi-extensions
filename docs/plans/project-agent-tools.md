# Project agent tools

Status: ready-for-tasking
Owner: unassigned
Related architecture: docs/architecture.md#command-and-tool-boundaries
Related tasks: task-fdd6f177, task-2bec9ed4, task-98a5a796, task-a9b94cfe, task-b201d6fc, task-1b16a357, task-1a48b4b8, task-10d149c0, task-895d60f4
Last updated: 2026-03-27

## Problem

Project operations are still under-defined in the native tool roadmap for `todu-pi-extensions`.

The current architecture says agent-facing tools should expose small composable backend operations through shared services, but the existing planning docs are still task-led:

- `docs/plans/agent-tools-v1.md` only includes `project_list` in the first wave
- `docs/plans/agent-tools-expansion.md` groups project parity and integration work together at a high level
- `docs/plans/todu-skills-tool-migration.md` classifies the historical project skills, but does not define a dedicated native project tool surface

That leaves several gaps:

- projects are visible mostly as task metadata instead of a first-class tool domain
- there is no native plan for a read pair such as `project_list` plus `project_show`
- plain project CRUD and repo-aware registration behaviors are still conceptually mixed together
- service-boundary decisions for future project mutations and integration helpers are not explicit enough to derive implementation tasks cleanly

Without a dedicated plan, project work risks staying fragmented across task-focused docs and external skill behavior.

## Goal

Define a dedicated native project-management tool plan for `todu-pi-extensions` that makes project discovery and management a first-class agent tool surface while keeping repository integration work clearly separated.

### Success criteria

- [x] A dedicated planning document exists for native project management agent tools.
- [x] The plan explains how it relates to the current architecture and existing task/project plans.
- [x] The plan distinguishes near-term project tool candidates from deferred project operations.
- [x] The plan separates plain project CRUD/parity tools from repo and integration-aware tools such as `project_check` and `project_register`.
- [x] The plan identifies required service and daemon-client work for each proposed tool area.
- [x] The plan defines high-level tool contracts and task-ready follow-up implementation candidates.

## Relationship to existing plans

This plan narrows the project-specific portion of the broader tool roadmap.

- `docs/architecture.md` remains the source of truth for command-versus-tool boundaries and shared service usage.
- `docs/plans/agent-tools-v1.md` remains the source of truth for the current first wave of already-approved task-focused tools, including the existing `project_list` implementation task.
- `docs/plans/agent-tools-expansion.md` remains the broader later-wave inventory for habits, recurring tools, and remaining parity gaps.
- `docs/plans/todu-skills-tool-migration.md` remains the migration map from historical skills to native tools.

This document fills the gap between those plans by defining the dedicated native project-tool surface, the boundary between pure project operations and repo-aware integration work, and the follow-up tasks needed to implement that surface incrementally.

## Non-goals

This plan does not try to:

- redesign slash-command UI flows for project browsing or editing
- define a new project slash-command, widget, or TUI roadmap
- migrate `todu-workflow` orchestration into tools
- cover habit or recurring domains
- implement the tools directly
- define a broad workspace or repo-bootstrap automation layer beyond what project tools need
- turn sync-strategy or integration-binding mutation into part of plain project CRUD

## User-facing behavior

This section describes the user-visible behavior of native agent-callable project tools only. It does not propose new slash-command or TUI project flows. References to slash commands in this document exist only to clarify the boundary between interactive UI work and tool contracts.

The long-term user-facing model should treat project operations the same way task operations are treated in the architecture:

- rich interactive project browsing or editing, if added later, should live in slash commands rather than in tool contracts
- native tools expose backend project operations when the user asks in normal chat
- repo-aware registration and status checks stay distinct from plain project record management

### Entry points

Planned native project tool areas:

#### Near-term read surface

- `project_list`
- `project_show`

#### Deferred project CRUD/parity surface

- `project_create`
- `project_update`
- `project_delete`

#### Deferred repo and integration-aware surface

- `project_check`
- `project_register`

### Main flow

#### 1. Plain project management requests

1. The user asks to list, inspect, create, update, or delete a project.
2. The model calls the matching native project tool.
3. The tool delegates to daemon-backed project services.
4. The tool returns concise text plus structured `details` payloads.
5. If the user later needs richer navigation or batch editing, that should be handled through slash-command UI work rather than by widening these tool contracts.

#### 2. Repo and integration-aware requests

1. The user asks whether the current repository is registered or asks to register a repository as a project.
2. The model calls a repo-aware project tool only for that integration-aware intent.
3. The tool combines daemon-backed integration data with explicit local repo context when needed.
4. The tool returns registration state or registration results without pretending those operations are ordinary project CRUD.

### Error, empty, and cancel states

- `project_list` should treat an empty result as a successful non-error outcome.
- `project_show` should return an explicit not-found result instead of throwing for missing project IDs.
- `project_create` and `project_update` should fail fast on invalid inputs instead of guessing field values.
- `project_delete` should report explicit success or explicit not-found behavior and surface backend refusal clearly if tasks or related data block deletion.
- `project_check` should report ambiguous or missing repo context clearly.
- `project_register` should report name conflicts, existing bindings, and repository ambiguity explicitly.
- These tools should remain non-interactive in their core contract. Any human approval requirements must come from the surrounding chat flow, not an in-tool TUI prompt.

### Non-interactive behavior

All project tools should work without a TUI.

Pure project tools should depend only on explicit parameters and daemon-backed services. Repo-aware tools may inspect the current repository only when that behavior is documented and unambiguous, with optional explicit path parameters as an escape hatch.

## Technical approach

### Recommended tool grouping

Project tools should be split into two technical families instead of one mixed bucket.

#### Family A: project record tools

These tools operate on canonical todu project records only.

Characteristics:

- no git inspection
- no integration-binding lookup unless needed only to enrich a result later
- parameters refer to project identifiers or project fields directly
- compatible with non-interactive execution and straightforward service contracts

This family includes:

- `project_list`
- `project_show`
- `project_create`
- `project_update`
- `project_delete`

#### Family B: project integration tools

These tools combine project data with repository or integration-binding context.

Characteristics:

- may inspect git remotes or repository paths
- need integration-binding daemon methods in addition to project methods
- must handle ambiguity from repo state, duplicate bindings, and provider parsing
- should stay separate from plain CRUD so their complexity does not leak into simple project operations

This family includes:

- `project_check`
- `project_register`

### First-wave recommendation

The first native project-tool wave should stay read-only and use the surface that already exists or is nearly trivial to expose.

#### First wave

- `project_list`
- `project_show`

Why this is the right first wave:

- both map cleanly to existing daemon-backed reads: `project.list` and `project.get`
- both fit the current extension service surface with minimal architectural risk
- together they make projects a first-class readable domain instead of only task metadata
- they avoid forcing unresolved mutation and integration decisions into the earliest implementation task

#### Deferred until project service expansion

- `project_create`
- `project_update`
- `project_delete`

These should wait until there is a dedicated mutation surface for project records rather than continuing to grow `TaskService` ad hoc.

#### Deferred until repo integration architecture is in place

- `project_check`
- `project_register`

These should wait until the extension has a small repo-context helper plus explicit integration-binding service support.

### Service-boundary recommendation

The current `TaskService` already exposes `listProjects()` and `getProject()` because task flows need project names and project selection. That is acceptable for the current read-only surface, but it should not become the long-term home for all project work.

Recommended direction:

1. Keep `listProjects()` and `getProject()` usable through the current service surface for near-term read tools.
2. Introduce a dedicated `ProjectService` before adding project mutations.
3. Introduce a separate `ProjectIntegrationService` or similarly narrow helper for repo-aware registration and binding checks.

This avoids two failure modes:

- a bloated `TaskService` that becomes a catch-all workspace API
- a vague all-purpose workspace service that hides the difference between plain project records and repository integration logic

### Required backend and service work by tool

#### `project_list`

Current support:

- `TaskService.listProjects()` already exists
- `ToduDaemonClient.listProjects()` already exists
- daemon RPC support already exists through `project.list`

Needed work:

- register the native tool
- define output formatting and `details` payload
- add tests for empty and non-empty results

#### `project_show`

Current support:

- `TaskService.getProject(projectId)` already exists
- `ToduDaemonClient.getProject(projectId)` already exists
- daemon RPC support already exists through `project.get`

Needed work:

- define a native tool contract for explicit project lookup by ID
- add formatter and structured `details`
- add not-found behavior tests

#### `project_create`

Current gaps:

- no dedicated project creation method on the extension service layer
- no native project creation tool contract yet
- no daemon-client wrapper for project creation in this repository

Needed work:

- add `createProject(input)` to a dedicated `ProjectService`
- add daemon-client coverage for `project.create`
- define input validation and duplicate-name behavior
- decide whether V1 create accepts only `name`, `description`, and `priority`, with status defaulting to `active`

Recommended scope:

- plain project record creation only
- no repository binding side effects
- no automatic current-repo inference

#### `project_update`

Current gaps:

- no project mutation method on the extension service layer
- no daemon-client wrapper for project updates in this repository
- historical skill behavior mixes sync-strategy changes into project updates, which should not carry over directly

Needed work:

- add `updateProject(input)` to `ProjectService`
- add daemon-client coverage for `project.update`
- define supported fields for native project updates
- explicitly keep integration strategy changes out of `project_update`

Recommended scope:

- support only project-record fields such as `name`, `description`, `status`, and `priority`
- treat integration strategy as a future integration-specific operation, not project CRUD

#### `project_delete`

Current gaps:

- no project delete method on the extension service layer
- no daemon-client wrapper for project deletion in this repository
- no native delete result contract yet

Needed work:

- add `deleteProject(projectId)` to `ProjectService`
- add daemon-client coverage for `project.delete`
- define explicit success and not-found result behavior
- decide whether to enrich delete results with contextual task counts by reusing `listTasks({ projectId })`

Recommended scope:

- delete the project record only
- rely on explicit user intent at the chat level rather than interactive in-tool confirmation
- surface backend rejection clearly if related data blocks deletion

#### `project_check`

Current gaps:

- no integration-binding service in this repository
- no documented repo-context helper for git remote discovery and normalization
- no daemon-client coverage for integration listing in this repository

Needed work:

- add a small repo-context helper that can resolve a repository path and parse remotes deterministically
- add a `ProjectIntegrationService` operation for checking repo bindings
- add daemon-client coverage for integration listing and any necessary project lookups
- define ambiguity handling for multiple remotes or multiple matching bindings

Recommended scope:

- read-only registration check
- explicit distinction between “not registered,” “ambiguous,” and “registered” states
- repo-derived behavior only for this integration-specific tool family

#### `project_register`

Current gaps:

- no project creation plus integration-binding orchestration service in this repository
- no daemon-client coverage for integration creation in this repository
- no conflict-resolution contract for project names or duplicate bindings

Needed work:

- reuse or build on `ProjectService.createProject`
- add a `ProjectIntegrationService.registerRepositoryProject(...)` or similarly explicit orchestration method
- add daemon-client coverage for integration creation and duplicate-check support
- define how explicit repo parameters override ambient current-repo context

Recommended scope:

- repository-aware registration only
- plain local project creation should use `project_create`
- provider and target parsing rules must be explicit and testable

### High-level tool contracts

The contracts below are intentionally high-level so follow-up tasks can refine TypeScript interfaces without reopening the product boundary.

#### Near-term read tools

##### `project_list`

Purpose:

- list projects known to the backend

Parameters:

- none in the initial native version

Result shape:

- `details: { kind: "project_list", projects, total, empty }`

Behavior:

- returns concise summary text
- empty list is a successful result
- backend or validation failures throw normal tool errors

##### `project_show`

Purpose:

- show one project by explicit project ID

Parameters:

- `projectId: string`

Result shape:

- `details: { kind: "project_show", projectId, found, project? }`

Behavior:

- missing project returns `found: false` instead of throwing
- service failures throw normal tool errors
- response should stay focused on project metadata, not embed a full task browser

#### Deferred project CRUD tools

##### `project_create`

Purpose:

- create a plain project record without repository side effects

Parameters:

- `name: string`
- `description?: string`
- `priority?: "low" | "medium" | "high"`

Result shape:

- `details: { kind: "project_create", input, project }`

Behavior:

- validates required fields and duplicate-name conflicts explicitly
- defaults status to `active`
- does not attach repository bindings

##### `project_update`

Purpose:

- update plain project-record metadata

Parameters:

- `projectId: string`
- `name?: string`
- `description?: string`
- `status?: "active" | "done" | "cancelled"`
- `priority?: "low" | "medium" | "high"`

Result shape:

- `details: { kind: "project_update", input, project }`

Behavior:

- at least one update field should be required by validation
- unsupported fields fail fast
- sync strategy and other binding concerns stay out of this contract

##### `project_delete`

Purpose:

- delete a plain project record by explicit ID

Parameters:

- `projectId: string`

Result shape:

- `details: { kind: "project_delete", projectId, found, deleted, project? }`

Behavior:

- missing project returns an explicit not-found result
- successful delete returns `deleted: true`
- backend refusal is surfaced clearly rather than masked as success

#### Deferred repo and integration-aware tools

##### `project_check`

Purpose:

- determine whether a repository is linked to a project

Parameters:

- `repositoryPath?: string`

Result shape:

- `details: { kind: "project_check", repository, registered, matches, ambiguous }`

Behavior:

- may default to the current working directory when repo context is unambiguous
- ambiguous repo or binding matches must be explicit non-success states
- not being registered is a successful informative result, not an error

##### `project_register`

Purpose:

- create or connect a project to a repository integration

Parameters:

- `projectName?: string`
- `repositoryPath?: string`
- `provider?: string`
- `targetRef?: string`
- `description?: string`
- `priority?: "low" | "medium" | "high"`

Result shape:

- `details: { kind: "project_register", project, binding, createdProject, createdBinding }`

Behavior:

- explicit repo inputs override ambient repo detection
- name conflicts and duplicate bindings are reported explicitly
- plain local project creation without a binding should use `project_create` instead

### Affected areas

Likely files and modules across the follow-up work:

- `src/extension/register-tools.ts`
- `src/tools/`
- `src/domain/task.ts` and possible future `src/domain/project.ts`
- `src/services/task-service.ts`
- a future `src/services/project-service.ts`
- a future `src/services/project-integration-service.ts`
- `src/services/todu/daemon-client.ts`
- `src/services/todu/todu-task-service.ts`
- future project-focused service tests and tool tests

### Data and state

The project-tool architecture should follow the same constraints as the broader extension design:

- daemon-backed services remain the source of truth
- tool handlers stay mostly UI-neutral
- project tool results should return stable structured `details` payloads
- task filtering by `projectId` remains the main way to inspect tasks within a project, instead of making project tools carry task-browse state
- repo-derived context should be gathered only for the integration-aware tool family

### Testing approach

Expected follow-up coverage:

- tool registration tests for the project tool surface
- execution tests for result shaping, parameter mapping, and service delegation
- not-found and empty-result tests for read tools and delete tools
- daemon-client and service tests for future project mutations
- parser and normalization tests for repo-context and integration-binding helpers
- no change to default CI scope beyond the repository's existing lint, typecheck, and unit test gates

## Open questions

Resolved decisions in this plan:

- [x] Native project tools should be planned as a dedicated domain instead of only as task-adjacent behavior.
- [x] The first native project wave should be read-only: `project_list` plus `project_show`.
- [x] Plain project CRUD should stay separate from repo and integration-aware tools.
- [x] `project_register` should not be treated as a synonym for plain `project_create`.
- [x] Project mutations should move behind a dedicated `ProjectService` before that surface expands further.
- [x] Repo-aware behavior should live behind a dedicated `ProjectIntegrationService` or equivalently narrow helper, not inside plain CRUD tools.

Intentional deferrals:

- filtered project listing beyond the initial unfiltered `project_list`
- task aggregation or analytics fields on `project_show`
- sync-strategy mutation as part of project tools
- habit and recurring tool planning
- any slash-command UI design work

## Task breakdown candidates

1. **Add dedicated project read tool plan alignment**
   - update project-related references in existing agent-tool docs if needed
   - success criteria: the native roadmap consistently refers to `project_list` and `project_show` as the first project read surface

2. **Implement `project_list` and `project_show`**
   - register both tools with concise output and stable `details`
   - success criteria: the model can list projects and inspect a known project by ID through native tools

3. **Extract or introduce a dedicated `ProjectService`**
   - move beyond project reads on `TaskService` before adding mutations
   - success criteria: project mutations have a clear home without turning `TaskService` into a catch-all

4. **Add daemon-backed project mutation support**
   - add `project.create`, `project.update`, and `project.delete` client and service coverage
   - success criteria: project CRUD tools can be implemented without mixing in repo-integration behavior

5. **Implement `project_create`, `project_update`, and `project_delete`**
   - keep contracts focused on plain project-record fields only
   - success criteria: the native project CRUD surface exists with explicit validation and not-found behavior

6. **Add repo-context and integration-binding services**
   - introduce deterministic repo parsing and integration lookup helpers
   - success criteria: registration and binding checks can be implemented without leaking repo logic into CRUD tools

7. **Implement `project_check` and `project_register`**
   - keep repo-aware behavior explicit and well-tested
   - success criteria: project registration and repo binding checks work as native tools with clear ambiguity handling

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
- `docs/plans/agent-tools-v1.md`
- `docs/plans/agent-tools-expansion.md`
- `docs/plans/todu-skills-tool-migration.md`
- `src/domain/task.ts`
- `src/services/task-service.ts`
- `src/services/todu/daemon-client.ts`
- `src/extension/register-tools.ts`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-list/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-check/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-register/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-update/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-delete/SKILL.md`
