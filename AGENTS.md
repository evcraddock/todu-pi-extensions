# AI Agent Guidelines for todu-pi-extensions

## Required Reading

Before working, read and follow:

- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
- [docs/CODE_STANDARDS.md](docs/CODE_STANDARDS.md)

You must follow these guidelines throughout your work.

## Project Overview

Task manager extensions for the pi agent harness that create UI for handling tasks.

Current status: project scaffold exists, but task UI functionality is not implemented yet.

## Tech Stack

- Language: TypeScript
- Framework: None
- Runtime: Node.js
- Target: pi extensions and TUI components

## Development

Use the existing scripts and Make targets:

- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `make check`
- `make pre-pr`

Use `make dev` only after the dev environment task is completed.

Read the Makefile before starting work.

## CI Policy

- Keep the default CI pipeline limited to build, lint, typecheck, and unit tests.
- Do not add integration tests to the default branch-push or pull-request CI workflow unless the user explicitly asks for that change.
- Integration tests should run through a separate opt-in workflow, script, or local/dev command when they are introduced.

## Task Lifecycle

- Starting: always run `task-start-preflight`

## PR Workflow

After implementation is complete:

1. run `./scripts/pre-pr.sh`
2. push branch and open/update PR
3. resolve CI if present
4. run the `pr-review` skill
5. report review result

## Conventions

- Use TypeScript strict mode
- Prefer small, composable modules
- Handle null explicitly with `??` and `?.`
- Write tests with Vitest
- Keep initialization/scaffolding changes separate from feature implementation where practical
