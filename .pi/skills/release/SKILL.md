---
name: release
description: Release @todu/pi-extensions with conversational changelog drafting. Use when user says "release", "cut a release", "publish to npm", "ship it", or similar.
---

# Release @todu/pi-extensions

Guide the release process through conversation. Draft a changelog collaboratively, bump the package version, tag, and push so GitHub Actions can publish `@todu/pi-extensions` to npm.

## Quick Reference

```bash
# Release script handles: version bump, package-lock update, commit, tag, push, verify
# Path relative to this skill directory
.pi/skills/release/scripts/release.sh <version>  # e.g. 0.2.0
```

## Workflow

### 1. Pre-flight

Verify readiness — stop and report if any check fails.

```bash
git branch --show-current             # must be main
git fetch origin main
git log origin/main..HEAD --oneline   # must be empty
gh pr list --state open --json number,title  # warn if any open
npm run lint
npm run typecheck
npm test
npm run build
npm run package:smoke
npm run package:check
```

### 2. Determine current version

```bash
LATEST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
CURRENT_VERSION=$(node -p "require('./package.json').version")
```

If no tags exist, current version is `0.0.0`.

### 3. Gather changes

Collect all changes since the last tag:

```bash
git log ${LATEST_TAG}..HEAD --oneline --no-merges
gh pr list --state merged --search "merged:>=$(git log -1 --format=%ci $LATEST_TAG | cut -d' ' -f1)" --json number,title,labels
```

Cross-reference task IDs from commit messages when present (patterns such as `task-xxxx`, `Task: #<id>`, or `#123`).

### 4. Recommend version bump

Analyze commit prefixes:

- `feat!:` or `BREAKING CHANGE:` → **major**
- `feat:` → **minor**
- `fix:` → **patch**

Present recommendation with reasoning. User confirms or overrides.

### 5. Draft changelog (conversational)

Generate a draft in Keep a Changelog format, grouped by category:

```markdown
## [X.Y.Z] - YYYY-MM-DD

Summary paragraph.

### Added

- Feature description (#PR)

### Fixed

- Bug fix description (#PR)

### Changed

- Change description (#PR)
```

Present the draft and ask for feedback. Iterate until the user approves.

### 6. Update CHANGELOG.md

If `CHANGELOG.md` doesn't exist, create it with the header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

Prepend the approved changelog entry below `## [Unreleased]`.

### 7. Run release script

Once the changelog is finalized:

```bash
.pi/skills/release/scripts/release.sh <version>
```

The script handles:

1. Validate on `main` with no unpushed commits
2. Update `package.json` and `package-lock.json`
3. Commit `CHANGELOG.md` plus version files
4. Create annotated tag `v<version>`
5. Push commit and tag
6. Verify tag exists on remote

**Do not run the script until the user has approved the changelog.**

### 8. Post-release

After the script succeeds:

```bash
gh run list --limit 1 --json databaseId,status,event --jq '.[0]'
```

Report that GitHub Actions is publishing the npm package and creating the GitHub release. Optionally wait for completion:

```bash
gh run watch <run-id>
```

## Important

- NEVER force push or use `--force` flags
- NEVER run the release script without user approval of the changelog
- The script verifies the tag was pushed — if it fails, read the error
- If anything fails, stop and report — do not retry blindly
