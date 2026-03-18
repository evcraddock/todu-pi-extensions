# Code Standards

## Formatting

Use Prettier. Run before committing:

```bash
npm run format
```

## Linting

Use ESLint:

```bash
npm run lint
```

## TypeScript

### Strict Mode

TypeScript strict mode is enabled. No implicit `any`, strict null checks.

### Types

- define types for all function parameters and return values
- use interfaces for object shapes
- export types that are part of the public API

### Null Handling

- use optional chaining (`?.`) and nullish coalescing (`??`)
- handle null cases explicitly

## Imports

- group imports: external, internal, relative
- use path aliases (`@/...`) when they improve readability

## Exports

- prefer named exports
- default exports are acceptable for pi extension entrypoints when pi requires them

## Functions

- keep functions small
- give each function one clear responsibility
- use object parameters for 3+ parameters

## Error Handling

- fail fast with contextual error messages
- do not silently swallow errors

## Testing

- use Vitest
- test public behavior where practical
- use `describe` / `it` blocks

## Pi Extensions

- prefer documented pi extension APIs over custom runtime conventions
- reuse built-in TUI primitives before creating custom components
- keep UI state easy to reconstruct from code or session state
