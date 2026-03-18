# Contributing

This document defines how to work in this project.

## Required workflow

1. Work only within task scope.
2. Read relevant files before editing.
3. Make the smallest change that satisfies the task.
4. Follow [CODE_STANDARDS.md](CODE_STANDARDS.md).
5. Do not add manual line breaks in markdown paragraphs.
6. If blocked or requirements are ambiguous, stop and report `BLOCKED` with reason.
7. Summarize changed files and verification results.

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
- Wait for explicit human merge approval.
- Never auto-merge.

## When stuck

After 3 failed attempts at the same problem:

1. Stop.
2. Document what was tried and why it failed.
3. Ask for guidance or propose alternatives.
