# Git Workflow Rules

## Commit Format
Use conventional commits:
```
type(scope): description

feat(shifts): add overnight shift support
fix(rota): resolve double-booking on DST transition
refactor(services): extract conflict detection into separate module
test(swaps): add edge cases for cross-department swaps
docs(api): update shift endpoints documentation
chore(deps): bump dependencies
```

## Branch Naming
```
feat/shift-swap-approval
fix/timezone-midnight-crossing
refactor/scheduling-engine
```

## PR Process
- PRs must have a clear description of what and why
- Link related issues
- Keep PRs focused — one feature/fix per PR
- Squash commits before merge

## Commit Discipline
- Commit working code only — no broken builds
- Commit often, push regularly
- Never commit secrets, .env files, or credentials
- Review diff before committing: `git diff --staged`
