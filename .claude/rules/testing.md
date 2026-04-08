# Testing Rules

## TDD Workflow
1. Write a failing test first (RED)
2. Write minimal code to pass (GREEN)
3. Refactor while keeping tests green (IMPROVE)
4. Never skip step 1 — tests prove the feature works

## Coverage Target
- Minimum 80% code coverage
- 100% coverage on scheduling engine and conflict detection (critical business logic)
- Run coverage check before PR submission

## Test Organization
- Mirror source structure: `src/services/scheduler.ts` → `tests/unit/services/scheduler.test.ts`
- Name tests descriptively: `should reject swap when target lacks required role`
- Group with describe blocks: feature → scenario → assertion

## What to Test
- Happy path + edge cases for every public function
- Error paths: invalid inputs, missing data, permission denied
- RMS-specific edge cases: DST transitions, midnight-crossing shifts, holiday overlaps, part-time hour limits
- Integration tests for API endpoints with real DB (not mocks)

## What NOT to Test
- Private/internal helper functions directly (test through public API)
- Framework internals (don't test that Express routes or Django views work)
- Third-party library behavior

## Test Quality
- Tests must be independent — no shared mutable state between tests
- Use factories/fixtures for test data, not raw objects
- Prefer `assert` with clear messages over generic `assertTrue`
- Flaky tests are bugs — fix or delete immediately
