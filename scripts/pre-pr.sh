#!/bin/bash
set -e

echo "Running pre-PR checks..."

echo "→ Formatting..."
npm run format

echo "→ Linting..."
npm run lint

echo "→ Type checking..."
npm run typecheck

echo "→ Running tests..."
npm test

echo "✓ All checks passed!"
