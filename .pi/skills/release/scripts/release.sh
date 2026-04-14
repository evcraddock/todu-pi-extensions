#!/usr/bin/env bash
#
# Release @todu/pi-extensions: bump version, commit, tag, push, verify.
#
# Usage:
#   ./.pi/skills/release/scripts/release.sh <version>   (e.g., 0.2.0)
#
# This script handles the mechanical release steps:
#   1. Validate on main with no unpushed commits
#   2. Update package.json and package-lock.json version
#   3. Commit CHANGELOG.md + version files
#   4. Create annotated tag
#   5. Push commit and tag
#   6. Verify tag exists on remote
#
# Prerequisites:
#   - CHANGELOG.md must already be updated
#   - Pre-flight checks must already pass
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

die() { echo -e "${RED}Error: $1${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.2.0"
  exit 1
fi

NEW_VERSION="$1"
NEW_TAG="v${NEW_VERSION}"

if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  die "Invalid version format: $NEW_VERSION (expected X.Y.Z or X.Y.Z-suffix)"
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  die "Must be on main branch (currently on '$CURRENT_BRANCH')"
fi

git fetch origin main --quiet
UNPUSHED=$(git log origin/main..HEAD --oneline)
if [[ -n "$UNPUSHED" ]]; then
  die "Unpushed commits on main:\n$UNPUSHED\n\nPush these first."
fi

if git tag --list | grep -q "^${NEW_TAG}$"; then
  die "Tag $NEW_TAG already exists locally"
fi
if git ls-remote --tags origin | grep -q "refs/tags/${NEW_TAG}$"; then
  die "Tag $NEW_TAG already exists on remote"
fi

if [[ ! -f CHANGELOG.md ]]; then
  die "CHANGELOG.md not found"
fi

info "Releasing: $NEW_TAG"

CURRENT_VERSION=$(node -p "require('./package.json').version")
if [[ "$CURRENT_VERSION" != "$NEW_VERSION" ]]; then
  info "Updating version: $CURRENT_VERSION -> $NEW_VERSION"
  npm version "$NEW_VERSION" --no-git-tag-version >/dev/null
else
  warn "package.json already at $NEW_VERSION"
fi

git add CHANGELOG.md package.json package-lock.json

if git diff --cached --quiet; then
  warn "No changes to commit"
else
  git commit -m "chore: release v${NEW_VERSION}"
  info "Committed release v${NEW_VERSION}"
fi

git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
info "Created tag: $NEW_TAG"

info "Pushing to origin..."
git push origin main --follow-tags

info "Verifying tag on remote..."
sleep 2

if ! git ls-remote --tags origin | grep -q "refs/tags/${NEW_TAG}$"; then
  die "Tag $NEW_TAG was NOT pushed to remote!\n\nManually push with: git push origin $NEW_TAG"
fi

info ""
info "✅ Released $NEW_TAG"
info "✅ Tag verified on remote"
info ""
info "GitHub Actions will now publish @todu/pi-extensions to npm and create the GitHub release."
info "Monitor at: gh run list --limit 1"
