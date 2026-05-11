# Git Workflow — PRM Dashboard

## Commit format
Conventional commits, lowercase scope:

```
type(scope): description

feat(prm): add agent-service-matrix breakdown endpoint
fix(prm): heatmap CAST(start_time/100) drops 23:59 rows
fix(auth): JwtStartupValidator rejects empty Jwt:Secret
refactor(shared): consolidate EscapeSingleQuotes into TenantParquetPaths
test(prm): add WebApplicationFactory middleware integration suite
docs(claude): document HHMM truncation invariant
chore(deps): bump DuckDB.NET 1.4.0 → 1.5.0
build(docker): pin base images to sha256 digests
```

Common scopes: `auth`, `tenant`, `prm`, `gateway`, `shared`, `frontend` (Angular 17), `frontend-v8` (Angular 8 + PrimeNG), `data`, `docker`, `compose`, `claude`, `deps`.

## Branch naming
```
feat/airport-multi-select
fix/heatmap-hhmm-truncation
refactor/parquet-path-validation
chore/eslint-baseline
```

## Commit discipline
- Commit working code only. `dotnet build` clean, `dotnet test` green, `npm run lint` clean before push.
- Small, focused commits. One bug fix or one feature step per commit. Splitting "fix the bug" from "add the regression test" is fine — they're related but distinct.
- Don't commit `.env`, `out/`, `bin/`, `obj/`, `node_modules/`, `dist/`. `.gitignore` already lists these.
- **Never** commit secrets, JWTs, BCrypt hashes from real users, or production data.
- Review the diff before committing: `git diff --staged`.
- Use `git add <path>` — avoid `git add -A` / `git add .` which can sweep in `.env` files or local scratch.

## When CLAUDE.md should change
- Any architectural decision → add a dated row to the "Architecture decisions" table.
- Stack change (new framework, version bump that affects conventions) → update the "Tech stack" table and the relevant rule file.
- New convention adopted → update the relevant `.claude/rules/*.md`.

The `check-sync.sh` Stop hook flags drift between `.claude/` files and `CLAUDE.md`.

## PR (when on a remote)
- Title under 70 chars. Use the description for context.
- Test plan as a checklist. For backend changes: which fixture / integration test covers it. For frontend: which dashboard tab to walk and what to look for.
- Squash before merge — keep `main` linear.

## Co-Author footer
Commits made with Claude Code include the standard footer:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

Don't strip it, don't claim solo authorship.
