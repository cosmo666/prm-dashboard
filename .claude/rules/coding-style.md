# Coding Style Rules

## Immutability
- Default to immutable data structures. Use mutation only when performance requires it and document why.
- Prefer creating new objects over modifying existing ones.

## File Organization
- One module/class per file. Max 300 lines per file — split if larger.
- Group imports: stdlib → third-party → local. No unused imports.
- Constants at the top, types/interfaces next, then implementation.

## Naming
- Descriptive names over abbreviations. `employeeSchedule` not `empSch`.
- Boolean variables: prefix with `is`, `has`, `can`, `should`.
- Functions: verb-first (`getShifts`, `validateSwap`, `calculateOvertime`).

## Error Handling
- Never swallow errors silently. Log or propagate with context.
- Use typed/custom errors for business logic failures (e.g., `ShiftConflictError`, `InsufficientCoverageError`).
- Validate inputs at the boundary (API layer), trust data in service layer.

## Comments
- Explain WHY, not WHAT. The code shows what; comments explain reasoning.
- TODO format: `// TODO(prerak): description - date`
- No commented-out code in commits.

## Functions
- Max 30 lines per function. Extract if longer.
- Max 3 parameters. Use an options/config object for more.
- Single responsibility — one function does one thing.
