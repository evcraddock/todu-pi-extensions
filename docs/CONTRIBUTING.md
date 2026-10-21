# Contributing

This document defines how to work in this project.

## Required workflow

1. Follow [CODE_STANDARDS.md](CODE_STANDARDS.md).
2. If blocked or requirements are ambiguous, stop and report `BLOCKED` with the reason, and add a comment to the task explaining the blocker or ambiguity.
3. Summarize changed files and verification results, and add that summary as a comment to the task.

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

Install project dependencies first. Before opening a pull request, format the code and run linting, type checking, and tests. Use the project's combined check and pre-PR scripts where appropriate.

## Review and integration

- Push your branch to GitHub.
- Use pull requests for review and integration whenever possible.
- Run the `pr-review` skill before merge.
