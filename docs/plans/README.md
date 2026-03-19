# Planning docs

This directory holds planning documents for work that is not yet ready to become implementation tasks.

A planning doc should reduce ambiguity enough that turning it into 1 to 5 concrete tasks is straightforward. Plans sit between high-level architecture and task creation.

## Status model

Use one of these statuses near the top of each plan:

- `draft` — still gathering decisions or narrowing scope
- `ready-for-tasking` — clear enough to turn into implementation tasks
- `done` — implemented or otherwise no longer active
- `superseded` — replaced by another plan or direction

## When to create a plan

Create a plan when any of the following are true:

- the work crosses multiple files or modules
- user-facing behavior is not fully defined yet
- implementation could be split in multiple reasonable ways
- there are open questions that should be resolved before task creation
- success criteria are not yet testable

Skip a plan for small, obvious, single-change tasks.

## Plan naming

Use kebab-case feature-oriented filenames:

- `task-create-flow.md`
- `task-clear-flow.md`
- `agent-tools-v1.md`
- `sync-status-ui.md`

Keep names stable so related tasks can reference them.

## Required sections

Start from [`_template.md`](_template.md). Every plan should cover:

1. problem
2. goal
3. non-goals
4. user-facing behavior
5. technical approach
6. open questions
7. task breakdown candidates
8. task-ready checklist
9. references

## Ready-for-tasking bar

A plan is `ready-for-tasking` when:

- scope is bounded
- user-visible behavior is clear
- important error and cancellation paths are defined
- affected code areas are known
- test strategy is stated
- open questions are resolved or explicitly deferred
- the work can be split into concrete tasks with clear success criteria

## Suggested initial plans

These are good candidates based on the current architecture and code state:

- `task-create-flow.md`
- `task-clear-flow.md`
- `agent-tools-v1.md`
- `task-metadata-actions.md`
- `sync-status-ui.md`
- `next-actions-widget.md`

## Task creation workflow

1. Draft or update the plan.
2. Resolve open questions or explicitly defer them.
3. Mark the plan `ready-for-tasking`.
4. Derive concrete tasks from the task breakdown candidates.
5. Link created task IDs back into the plan.
6. Update plan status as implementation progresses.

## Suggested header block

Use a short metadata block at the top of each plan:

```md
Status: draft
Owner: unassigned
Related architecture: docs/architecture.md#section-name
Related tasks: none yet
Last updated: 2026-03-19
```

## Notes

Keep plans decision-oriented. They should answer what will be built, what will not be built, how success will be measured, and what still needs an explicit decision before task creation.
