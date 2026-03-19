# Contributing

This document defines how to work in this project.

## Task start disclosure and approval

Before implementation begins on a task, disclose the plan and get approval.

Do not start implementation on an undisclosed plan.

Use this template and keep it concise:

```md
## Work Summary

- Task: #<id> — <title>
- Objective: <one sentence goal>
- In scope:
  - <scope item>
- Out of scope:
  - <out-of-scope item>

### Acceptance criteria

- [ ] <criterion copied from task>
- [ ] <criterion copied from task>

### Files to read

- `<path>`
- `<path>`

### Files likely to change

- `<path>`
- `<path>`

If the exact file list is not known yet, say so explicitly and keep the eventual changes scoped.

### Implementation steps

1. <step>
2. <step>
3. <step>

### Verification plan

- `<command>`
- `<command>`

### Open questions / risks

- <item>
- or `None`

### Approval

Reply with `approve` to proceed.
```

The goal is simple: the human should be able to see what the agent intends to do and explicitly approve it before implementation starts.

Once the human replies with `approve`, move the task status to `inprogress` before making implementation changes.

## Required workflow

1. Work only within task scope.
2. Read relevant files before editing.
3. Make the smallest change that satisfies the task.
4. Follow [CODE_STANDARDS.md](CODE_STANDARDS.md).
5. For implementation tasks, show the Work Summary above and get approval before starting.
6. After approval, move the task to `inprogress` before making implementation changes.
7. Do not add manual line breaks in markdown paragraphs.
8. If blocked or requirements are ambiguous, stop and report `BLOCKED` with reason.
9. Summarize changed files and verification results.

## Branch and commits

Start from the latest main branch and create a task branch:

```bash
git checkout main && git pull
git checkout -b feat/{task-id}-short-description
```

Branch prefixes:

- `feat/` - new features
- `fix/` - bug fixes
- `docs/` - documentation only
- `chore/` - maintenance

Commit format:

```text
<type>: <short description>

Task: #<task-id>
```

## Verification setup

Install dependencies first:

```bash
npm install
```

Run these checks before opening a PR:

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

Or run the combined commands:

```bash
make check
make pre-pr
```

## Review and integration

- Push your branch to GitHub.
- Use pull requests for review and integration whenever possible.
- Run the `pr-review` skill before merge.
- Start `pr-review` through the `tmux` skill as a sub-agent in a visible tmux session so the review run is observable.
- Wait for explicit human merge approval.
- Never auto-merge.

## When stuck

After 3 failed attempts at the same problem:

1. Stop.
2. Document what was tried and why it failed.
3. Ask for guidance or propose alternatives.
