# Development Workflow

## Research First
Before coding any non-trivial feature:
1. Search for existing solutions and patterns
2. Check if the framework/library already handles it
3. Read relevant documentation
4. Only then start implementing

## Implementation Order
For new features, follow this sequence:
1. Data model / schema changes
2. Service layer (business logic)
3. API / route handlers
4. Tests (or TDD: write tests first)
5. Documentation updates

## Code Review Checklist (Self-Review)
Before committing, verify:
- [ ] All tests pass
- [ ] No hardcoded values that should be configurable
- [ ] Error handling is present and meaningful
- [ ] No console.log / print statements left in
- [ ] No TODO items that should be resolved now
- [ ] Git diff looks clean — no unintended changes

## When Stuck
1. Re-read the error message carefully
2. Check the test output
3. Isolate the problem — create a minimal reproduction
4. Search docs/Stack Overflow before asking for help
5. If Claude is going in circles, start a fresh session with a clear problem statement
