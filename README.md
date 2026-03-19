# todu-pi-extensions

Task manager extensions for the pi agent harness that create UI for handling tasks.

## Status

This repository is currently initialized with project scaffolding only. It does not yet implement the task UI extension behavior.

The initial architecture design is documented in [`docs/architecture.md`](docs/architecture.md).

## Goals

- build pi extensions focused on task-management workflows
- provide TUI components and interactions for handling tasks inside pi
- package the extensions so they can be loaded locally or installed as a pi package later

## Prerequisites

- Node.js 20+
- npm
- [pi](https://github.com/badlogic/pi-mono) installed locally for manual extension testing
- [overmind](https://github.com/DarthSim/overmind) for the local dev environment
- [`todu`](https://github.com/evcraddock/todu) CLI installed locally to run the isolated dev daemon

## Installation

```bash
npm install
cp .env.example .env
```

The `.env` file is optional. It currently exists for local development overrides such as daemon log level.

## How to Work on This Project

### Start the Dev Environment

```bash
make dev
```

This starts an isolated local todu daemon and a TypeScript watch process via overmind.

On first run, `make dev` copies `config/dev.todu.yaml.template` to `config/dev.todu.yaml` automatically.

The dev daemon uses a project-local data directory at `.dev/todu/data/`, so it does not touch your normal `~/.config/todu` state.

### Check Dev Daemon Status

```bash
make dev-status
make dev-daemon-status
```

### Run todu Commands Against the Isolated Dev Daemon

```bash
make dev-cli CMD="project list"
make dev-cli CMD="task list"
```

### View Logs

```bash
make dev-logs   # attach to the overmind session
make dev-tail   # show a non-blocking recent log tail
```

### Stop the Dev Environment

```bash
make dev-stop
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

The project uses an isolated local todu daemon for development. The writable dev config lives at `config/dev.todu.yaml` and is created from `config/dev.todu.yaml.template` on first `make dev`.

The local daemon stores state under `.dev/todu/data/`, which is gitignored.

Manual pi extension testing is still a separate step. This task sets up the backend/client-side dev environment and local feedback loop, not a full automated pi runtime.

## Project Layout

```text
config/               Local dev daemon config template
src/                  Extension entrypoint and future task UI code
docs/                 Project workflow, coding standards, and architecture design
scripts/pre-pr.sh     Local verification script
.dev/                 Gitignored local daemon state created by make dev
```

## License

MIT
