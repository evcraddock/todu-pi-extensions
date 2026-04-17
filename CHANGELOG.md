# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-16

This release expands the multi-user actor rollout in `@todu/pi-extensions`. It adds actor-aware task and note handling, project authorization management, and new mapping, trust, and approval surfaces for integration-backed workflows.

### Added

- Added actor-aware task and note flows so task assignees and note authors can be represented by actor IDs with display-name hydration. (#112)
- Added actor management tools and project authorized-assignee management tools. (#113)
- Added integration mapping, trust-management, approval, and warning tools and UI surfaces. (#114)

### Fixed

- Preserved fallback assignee display names during actor hydration. (#112)
- Made actor display hydration best effort when actor listing is unavailable. (#112)
- Wired actor validation into project update tools so runtime project auth updates validate actor IDs consistently. (#113)

### Changed

- Task and note views now surface approval metadata and binding-scoped unmapped assignee warnings where available. (#114)
- Task assignment flows now enforce project authorization and archived-actor rules for new assignments while preserving stale historical assignments. (#113)

## [0.1.0] - 2026-04-14

Initial public release of `@todu/pi-extensions`, a Pi package that brings todu-backed task, project, habit, recurring task, and note workflows into Pi with native tools, commands, and TUI integrations.

### Added

- Native Pi package support for `@todu/pi-extensions`, including built `dist/` packaging, npm-ready metadata, release automation, and a repo-local Pi release skill (#110)
- Native task read and mutation tools for listing, showing, updating, moving, and deleting tasks (#71, #74, #77, #78, #87, #96, #98)
- Task browse, detail, creation, clearing, current-task context, saved filters, and quick-action command flows inside Pi (#71, #73, #80, #82)
- Native project tools and services, including project listing, lookup, CRUD operations, and repository integration helpers (#71, #73)
- Native habit tools and commands, including habit listing, detail, streak-aware check handling, and habit note support (#74, #80, #89, #90, #94)
- Native recurring task tools and shared scheduling support (#73)
- Native note tools, including note listing and full note detail lookup (#88, #104)
- Sync status UI and daemon-backed integration foundations, including persistent daemon connection management and client wrappers (#71, #73)

### Changed

- Updated Pi dependencies to the latest stable versions (#99)
- Improved `/tasks` with default project/status/priority filtering and richer date and timezone-aware list filters (#82, #92, #96, #98)
- Refined install and development documentation for the packaged workflow (#110)

### Fixed

- Removed truncation from `note_list` results so note content is returned in full (#105)
- Removed item caps from list tool formatters for more complete result sets (#103)
- Tolerated missing streak data in habit check responses (#94)
- Made project repo-context resolution injectable and improved project-name lookup during task creation (#82)
- Fixed several task-flow UI edge cases around task creation, detail actions, sync status, and error handling (#71, #73, #80)
