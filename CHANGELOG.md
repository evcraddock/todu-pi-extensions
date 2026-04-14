# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
