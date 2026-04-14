#!/bin/bash
set -e

echo "Running pre-PR checks..."

echo "→ Formatting..."
npm run format

echo "→ Linting..."
npm run lint

echo "→ Type checking..."
npm run typecheck

echo "→ Building package..."
npm run build

echo "→ Running tests..."
npm test

echo "→ Smoke testing packaged entrypoint..."
npm run package:smoke

echo "→ Verifying npm package contents..."
npm run package:check

echo "✓ All checks passed!"
