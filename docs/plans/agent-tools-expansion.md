# Agent tools expansion

Status: draft
Owner: unassigned
Related architecture: docs/architecture.md#command-and-tool-boundaries
Related tasks: task-98a5a796, task-068cdeb7
Last updated: 2026-03-27

## Problem

A first native tool wave can cover only the task and project operations already supported by the current extension service layer. The remaining `todu-skills` entries still need meaningful backend and domain work before they can move into native pi tools cleanly.

Those remaining skills are still good tool candidates in principle, but they fall outside the current repository surface for different reasons:

- task/project parity gaps such as move, delete, or project registration need more daemon-backed service methods
- `project-check` depends on integration bindings and git-remote context, which the extension does not model yet
- habit and recurring skills need entirely new domain and service layers inside this repository

Without a plan for these later waves, `agent-tools-v1.md` could stall at a narrow subset while the rest of `todu-skills` remains permanently external.

Project-specific native tool boundaries now have a dedicated plan in `docs/plans/project-agent-tools.md`, so this document should stay focused on broader later-wave inventory and non-project domains.

## Goal

Capture the follow-on work needed to migrate the remaining tool-friendly `todu-skills` into native pi extension tools after the first task/project wave lands.

### Success criteria

- [ ] The remaining skill inventory is grouped into concrete follow-on domains.
- [ ] Required service and daemon-client expansions are identified for each domain.
- [ ] Repo-context and integration-binding requirements are called out explicitly.
- [ ] Habit and recurring migrations are scoped separately from task/project parity gaps.
- [ ] The plan can be split into later implementation tasks without treating `todu-workflow` as tool work.

## Non-goals

This expansion plan does not try to:

- redefine the `agent-tools-v1.md` scope
- migrate `todu-workflow` orchestration skills into tools
- commit to one big all-at-once implementation wave
- replace Electron-specific UI actions inside `../todu/packages/electron/src/main/tools.ts`
- add brand-new todu domains beyond the current `todu-skills` package

## User-facing behavior

The long-term desired behavior is that most operation-oriented todu requests inside pi can be satisfied by native tools rather than external skill prompts.

### Entry points

Likely later tool areas:

- task/project parity tools
- project registration and integration-binding tools
- habit tools
- recurring tools

### Main flow

1. A later implementation wave adds new domain/service support inside `todu-pi-extensions`.
2. The extension registers new native tools for that domain.
3. The model uses those tools directly when the user asks for the corresponding operation.
4. Existing slash commands and workflow skills remain complementary rather than replaced.

### Error, empty, and cancel states

- Project-registration and integration-check tools must report git or binding ambiguity clearly.
- Habit and recurring list tools should treat empty results as non-error.
- Destructive tools such as delete should return explicit success or not-found results and should not guess.
- Schedule-validation failures for habits and recurring templates should be contextual and structured.

### Non-interactive behavior

These later tools should still aim to work in non-interactive mode, with explicit parameters instead of TUI prompts wherever possible.

## Technical approach

### Expansion domains

#### 1. Task and project parity gaps

Remaining candidates:

- `task-delete`
- `task-move`
- `project-update`
- `project-delete`

Needed work:

- widen the extension service contracts beyond the current `TaskService` mutation surface
- add daemon client methods for delete and move operations
- decide whether project mutations should live on `TaskService` or a broader workspace service

#### 2. Project registration and repository integration tools

Remaining candidates:

- `project-check`
- `project-register`

Recommended boundary:

- keep these tools inside `todu-pi-extensions` as native tools rather than leaving them permanently in external skills
- do not fold them into plain task or project CRUD modules
- implement them through a dedicated integration-focused service boundary, such as `ProjectIntegrationService`, that sits alongside `TaskService` and the future `ProjectService`
- keep repo-derived context in a narrow helper layer rather than in the tool handlers or CRUD services directly

Why this is the right boundary:

- the historical skills are still operation-oriented and map well to native tools once the missing runtime pieces exist
- they need daemon-backed integration data plus local repository inspection, which is a different responsibility than plain project record reads or writes
- keeping them in a separate service family prevents `TaskService` or `ProjectService` from turning into a catch-all workspace API
- the extra complexity is narrow and explicit instead of leaking into every project tool

Needed work:

- add a small repo-context helper that can resolve a repository path, inspect git remotes deterministically, and normalize provider plus target reference data
- model integration bindings in the extension runtime through a dedicated integration service boundary rather than a broad workspace service
- add daemon-backed integration listing and mutation support
- define clear precedence between explicit tool parameters and ambient current-repo detection
- define explicit ambiguity handling for multiple remotes, unsupported remote formats, duplicate bindings, and multiple matching bindings

Recommended parameter and context policy:

- repo-aware tools may default to the current working directory only when repository context is unambiguous
- explicit tool parameters such as `repositoryPath`, `provider`, or `targetRef` must override ambient repo detection
- tool handlers should delegate repo inspection and normalization to the repo-context helper rather than parsing git output inline

These tools are still plausible, but they should be treated as a separate integration family rather than as an extension of task/project parity work.

#### 3. Habit tools

Remaining candidates:

- `habit-create`
- `habit-list`
- `habit-update`
- `habit-check`
- `habit-delete`

Needed work:

- add habit domain types to this repository
- add daemon client methods and service abstractions for habit read and mutation operations
- decide whether RRULE parsing belongs in tool params, helper utilities, or model-side prompting guidance

#### 4. Recurring tools

Remaining candidates:

- `recurring-create`
- `recurring-list`
- `recurring-update`
- `recurring-delete`

Needed work:

- add recurring domain types and service interfaces
- add daemon client coverage for recurring templates
- define the minimum recurring tool surface for V1 versus later schedule-oriented helpers such as upcoming occurrences

### Affected areas

Likely files and modules across later waves:

- `src/domain/`
- `src/services/`
- `src/services/todu/daemon-client.ts`
- `src/extension/register-tools.ts`
- new tool modules under `src/tools/`
- tests for new services, tool contracts, and parsing helpers

### Data and state

This expansion should stay aligned with the repository architecture:

- backend truth remains in todu, not session state
- tools should call daemon-backed services, not the CLI
- local repo context should be gathered only for tools that genuinely need it, such as `project-check`
- schedule parsing helpers should be deterministic and testable if added
- later tools should continue the V1 policy of staying mostly UI-neutral unless there is a strong reason to introduce UI-aware side effects
- later waves should preserve the V1 contract style where possible: domain-first naming, explicit parameter shapes, and stable structured `details`

### Testing approach

Expected testing needs by domain:

- unit tests for daemon-client method mapping and service contracts
- tool execution tests for new domains and destructive operations
- parser tests for RRULE or repository URL handling where helper logic is introduced
- manual verification for tool-selection quality in real prompt flows

## Open questions

Resolved carry-forward decisions:

- [x] Later tool names should continue the architecture-style domain-first naming established in V1.
- [x] Later migrations may keep folding adjacent historical skills into one normalized tool per core operation.
- [x] Later tools should remain mostly UI-neutral by default.

Still open:

- [ ] Should habit and recurring support be added through one broader workspace service or through separate domain-specific services?
- [ ] Should RRULE parsing be implemented as repository utilities, or should the model provide normalized schedule strings directly to tools?
- [ ] Should destructive tools such as delete require a confirmation pattern, or is direct tool execution acceptable because the model already received the user's request?

Resolved in this plan:

- [x] Project integration operations should live in the same `todu-pi-extensions` package as other native tools, but behind a dedicated integration-focused service boundary instead of inside `TaskService` or plain project CRUD services.
- [x] Repository-derived context should be handled by a narrow repo-context helper plus explicit tool parameters, with explicit parameters taking precedence over ambient current-repo detection.
- [x] Integration-binding lookup and mutation requirements should be treated as explicit daemon-client expansion work, not inferred behavior in the tool layer.
- [x] Multiple remotes, unsupported remote formats, duplicate bindings, and multiple matching bindings should remain explicit ambiguity states rather than guessed-through cases.

Intentional deferrals for this area:

- exact daemon RPC method names and payload shapes for integration operations until the service-foundation implementation task
- any automatic project-name suggestion or conflict-resolution UX beyond what the dedicated `project_register` task defines
- any reuse of integration bindings to enrich plain project CRUD results

Intentional deferrals:

- any migration of `todu-workflow`
- any attempt to turn repo/bootstrap workflows such as `project-init` or `quality-tooling` into tools

## Task breakdown candidates

1. **Expand task/project service parity**
   - add move, delete, and project mutation operations
   - success criteria: remaining task/project CRUD-style skills become tool candidates
2. **Add repository integration service support**
   - add a dedicated `ProjectIntegrationService`, repo-context helper, and daemon-backed integration bindings support
   - success criteria: `project-check` and `project-register` can be implemented natively without leaking repo logic into plain project CRUD services
3. **Add habit domain and tools**
   - add types, service layer, and native habit tools
   - success criteria: core habit skills are covered by native tools
4. **Add recurring domain and tools**
   - add types, service layer, and native recurring tools
   - success criteria: core recurring skills are covered by native tools
5. **Plan overlap reduction with external skills**
   - decide how overlapping `todu-skills` entries should be deprecated or documented once native tools exist

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
- `src/extension/register-tools.ts`
- `src/services/todu/daemon-client.ts`
- `../todu/packages/electron/src/main/tools.ts`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-check/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/project-register/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/habit-create/SKILL.md`
- `/home/erik/.pi/agent/git/github.com/evcraddock/todu-skills/skills/recurring-create/SKILL.md`
