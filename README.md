# todu-pi-extensions

Task manager extensions for the pi agent harness that create UI for handling tasks.

## Status

This repository is currently initialized with project scaffolding only. It does not yet implement the task UI extension behavior.

## Goals

- build pi extensions focused on task-management workflows
- provide TUI components and interactions for handling tasks inside pi
- package the extensions so they can be loaded locally or installed as a pi package later

## Prerequisites

- Node.js 20+
- npm
- [pi](https://github.com/badlogic/pi-mono) installed locally for manual extension testing
- [overmind](https://github.com/DarthSim/overmind) for the future dev environment task

## Installation

```bash
npm install
```

## How to Work on This Project

### Start the Dev Environment

```bash
make dev
```

This will work after the dev environment is configured.

### View Logs

```bash
make dev-logs
make dev-tail
```

### Check Status

```bash
make dev-status
```

### Run Tests and Linting

```bash
make check
```

### Before Opening a PR

```bash
make pre-pr
```

### Available Make Commands

```bash
make help
```

## Follow-up Tasks

- `task-99585d8f` — `Design todu-pi-extensions architecture`
- `task-3d758b6a` — `Set up dev environment`

## Dev Environment Setup

The dev environment still needs project-specific configuration. See todu task `task-3d758b6a` (`Set up dev environment`) for the follow-up work.

## Project Layout

```text
src/                  Extension entrypoint and future task UI code
docs/                 Project workflow and coding standards
scripts/pre-pr.sh     Local verification script
```

## License

MIT
