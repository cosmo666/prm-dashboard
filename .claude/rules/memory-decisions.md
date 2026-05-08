# Technical Decisions — PRM Dashboard

This is a project-level decisions log. The authoritative log lives in CLAUDE.md → "Architecture decisions" table; this file captures additional context (not in the canonical table) and explicitly-noted user preferences.

## Architecture (already documented in CLAUDE.md)
The following are recorded in the canonical "Architecture decisions" table — see [CLAUDE.md](../../CLAUDE.md):

- Multi-tenant via per-tenant Parquet (`data/{slug}/prm_services.parquet`)
- Tenant resolution: subdomain → slug → `X-Tenant-Slug` header → file path (pure string function)
- Runtime data layer: DuckDB.NET 1.5.0; no ORM
- JWT in memory + httpOnly refresh cookie (15m / 7d)
- Airport-level RBAC enforced server-side at `AirportAccessMiddleware`
- Dedup via `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) = 1`
- Duration via `HhmmSql.ActiveMinutesExpr`
- HHMM integer truncation uses DuckDB `//` (never `CAST(/100 AS INTEGER)`)
- `BaseQueryService.BuildWhereClause` is the single SQL-filter source of truth
- `ClockSkew = TimeSpan.Zero` on every JWT validator
- `JwtStartupValidator` enforces non-empty / non-placeholder / ≥32-byte secrets
- Slug regex `^[a-z][a-z0-9-]{0,49}$` validated at `TenantParquetPaths.TenantPrmServices`
- Container hardening: non-root `USER app`, sha256-pinned base images, per-service `HEALTHCHECK`

## Notable carry-overs from the user's auto-memory
The user's per-project auto-memory (at `C:\Users\prera\.claude\projects\c--Users-prera-dev-ai-angular-powerbi\memory\MEMORY.md`) records additional context worth surfacing here:

- **Runtime is Docker-served**: rebuild the affected container after a code change; never suggest `ng serve` / `dotnet run` as the default workflow.
- **Frontend Angular 8 rewrite plan exists** (Phase 0 spec at `docs/superpowers/plans/`) targeting Angular 8.2.x / CLI 8.3.3 / TS 3.4.5 / RxJS 6.5.2 / PrimeNG 8.0.3 / PrimeIcons 2.0.0 / ngx-bootstrap 5.1.0 to match a host application. **Until that work lands, the codebase remains Angular 17 + Material 3** as documented in CLAUDE.md.
- **Design direction: "Operations Console"** — Fira Sans + Fira Code, indigo `#2563EB` primary, slate ramp, monospace for IDs/numerics. No purple-on-white, no rainbow KPIs.
- **PrimeNG 8.0.3 quirks** (only relevant once the rewrite starts): uses `.ui-*` not `.p-*` (rebrand was 9.0); CSS variables in themes only from 11+; `primeng.min.css` ships empty, use `primeng.css`. Theme pair: `nova-light` + `nova-dark`.

## Recent decisions
- **2026-05-07**: Audited and rewrote `.claude/` infrastructure — files were carried over from a prior DPDP CMS project. Replaced agents (planner/architect/code-reviewer), rules (architecture, coding-style, dev-workflow, security, testing, performance, git-workflow, agents, auto-sync), and memory files to reflect the actual PRM Dashboard stack (Angular 17 + .NET 8 + DuckDB-over-Parquet). Kept `dotnet-backend.md`, `angular-frontend.md`, and the `prm-domain` skill — those were already PRM-correct. Added `.claude/README.md` describing the configured infrastructure.
