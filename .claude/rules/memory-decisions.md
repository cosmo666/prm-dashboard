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
- **Angular 8 rewrite shipped and now lives alongside Angular 17 on `main`** as of 2026-05-11. Two frontends, same backend (Angular 17 in `frontend/` on port 4200, Angular 8 + PrimeNG in `frontend-v8/` on port 4300). Original rewrite history is preserved on the `angular-8-rewrite` branch.
- **Design direction: "Operations Console"** — Fira Sans + Fira Code, indigo `#2563EB` primary, slate ramp, monospace for IDs/numerics. No purple-on-white, no rainbow KPIs.
- **PrimeNG 8.0.3 quirks** (only relevant once the rewrite starts): uses `.ui-*` not `.p-*` (rebrand was 9.0); CSS variables in themes only from 11+; `primeng.min.css` ships empty, use `primeng.css`. Theme pair: `nova-light` + `nova-dark`.

## Recent decisions
- **2026-05-11**: **Dual frontends colocated on `main`.** Both `frontend/` (Angular 17, port 4200) and `frontend-v8/` (Angular 8 + PrimeNG, port 4300) talk to the same `gateway`/`auth`/`tenant`/`prm` containers and share the same per-tenant Parquet data; `docker compose up -d --build` brings up 6 healthy containers. Imported the v8 tree via `git read-tree --prefix=frontend-v8/ -u angular-8-rewrite^{tree}:frontend` (no history merge). New rule file `.claude/rules/angular-v8-frontend.md` carries the Angular-8 conventions from the rewrite branch; `angular-frontend.md` was re-scoped to `frontend/` only. CORS allowlists on all four backend services extended to include `:4300` origins. See the canonical CLAUDE.md "Architecture decisions" row for the same date.
- **2026-05-07**: Audited and rewrote `.claude/` infrastructure — files were carried over from a prior DPDP CMS project. Replaced agents (planner/architect/code-reviewer), rules (architecture, coding-style, dev-workflow, security, testing, performance, git-workflow, agents, auto-sync), and memory files to reflect the actual PRM Dashboard stack (Angular 17 + .NET 8 + DuckDB-over-Parquet). Kept `dotnet-backend.md`, `angular-frontend.md`, and the `prm-domain` skill — those were already PRM-correct. Added `.claude/README.md` describing the configured infrastructure.
