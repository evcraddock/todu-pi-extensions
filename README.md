# todu-pi-extensions

`todu-pi-extensions` is a pi package that adds todu-focused commands, tools, and TUI workflows to [pi](https://pi.dev). It is the pi-side integration layer for working with tasks from [todu](https://github.com/evcraddock/todu) without leaving the agent.

Today the package is focused on task browsing, task detail, task creation, and task updates inside pi.

## How it fits together

- [pi](https://pi.dev) is the host coding agent and extension runtime.
- [todu](https://github.com/evcraddock/todu) is the task backend and CLI.
- `todu-pi-extensions` connects pi to todu.
- [todu-workflow](https://github.com/evcraddock/todu-workflow) is an optional companion project with higher-level workflow skills and policies.

`todu-workflow` is not a hard dependency. You can use this package by itself, use it alongside `todu-workflow`, or build your own workflow on top of pi and todu.

## Prerequisites

Install these first:

- [pi via pi.dev](https://pi.dev)
- [todu via github.com/evcraddock/todu](https://github.com/evcraddock/todu)
- Node.js 20+
- npm
- [overmind](https://github.com/DarthSim/overmind) for the local dev environment

## Install the extension

Install from git:

```bash
pi install git:github.com/evcraddock/todu-pi-extensions
```

Install project-local instead of globally:

```bash
pi install -l git:github.com/evcraddock/todu-pi-extensions
```

Install from a local checkout while developing:

```bash
pi install /path/to/todu-pi-extensions
```

After installation, reload pi if it is already running.

## Basic usage

Use the extension inside pi with commands such as:

- `/tasks` to browse and filter tasks
- `/task` to inspect the current task or a task by ID
- `/task-new` to create a task
- `/task-clear` to clear the current task context

The package also exposes agent tools for structured task operations such as listing tasks, showing task details, and creating or updating tasks.

## Work on this project

```bash
npm install
make dev
```

`make dev` starts the local dev environment, including the isolated todu daemon used by this repository.

Useful commands:

```bash
make check
make pre-pr
make dev-cli CMD="task list"
make help
```

The isolated dev daemon keeps its state under `.dev/` so local development does not touch your normal todu data.

## License

MIT
