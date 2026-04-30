# CLAUDE.md — PRM Dashboard

Project instructions for Claude Code working in this repo. Inherits from `dev-ai/CLAUDE.md` (parent global preferences); this file overrides where they conflict.

## What this project is

Multi-tenant PRM (Passenger with Reduced Mobility) analytics POC for airport ground-handling operations. See [README.md](README.md).
  
## Tech stack (authoritative)

| Layer | Tech |
|---|---|
| Backend runtime | .NET 8 |
| Backend framework | ASP.NET Core Web API |
| Runtime data layer | DuckDB (`DuckDB.NET.Data` 1.5.0) reading per-tenant Parquet files |
| Data storage | Apache Parquet under `data/master/*.parquet` and `data/{tenant}/prm_services.parquet` |
| Auth | `BCrypt.Net-Next` (password hashing), `System.IdentityModel.Tokens.Jwt` (JWT) |
| Refresh-token store | `InMemoryRefreshTokenStore` (AuthService) — process-local, forgotten on restart |
| API Gateway | Ocelot (latest for .NET 8) |
| Frontend framework | Angular 17+ (standalone components, no NgModules) |
| UI library | Angular Material 3 (custom theme) |
| Charts | Apache ECharts via `ngx-echarts` |
| Frontend state | NgRx Signal Store (`@ngrx/signals`) |
| Seed data format | CSV committed under `data/` — refresh the sibling Parquet via `tools/PrmDashboard.ParquetBuilder` |
| Container orchestration | Docker Compose |

**Shared library** (`backend/src/PrmDashboard.Shared/`) holds the DuckDB abstractions (`IDuckDbContext`, `TenantParquetPaths`, `DataPathOptions`, `DataPathValidator`), DTOs, and pure helper functions. All 4 microservices reference it. Never add business logic there — just data shapes.

## Key directories

```text
backend/
  PrmDashboard.sln                         # Legacy .sln (not .slnx) for Dockerfile compatibility
  src/
    PrmDashboard.Shared/                   # DuckDB abstractions + DTOs + TimeHelpers (no business logic)
      Data/                                # IDuckDbContext, DuckDbContext, TenantParquetPaths,
                                           #   DataPathOptions, DataPathValidator, PooledDuckDbSession
      DTOs/                                # 9 DTO files grouped by domain
      Extensions/                          # TimeHelpers (HHMM integer encoding)
      Logging/                             # SerilogBootstrap
      Middleware/                          # CorrelationIdMiddleware, TenantSlugClaimCheckMiddleware
      Models/                              # Employee, EmployeeAirport, TenantInfo (plain data shapes — no EF)
    PrmDashboard.AuthService/              # Login, refresh, logout, /me — reads employees from
                                           #   master/employees.parquet; refresh tokens InMemoryRefreshTokenStore
    PrmDashboard.TenantService/            # /config + /airports — reads master/tenants.parquet via
                                           #   TenantsLoader (startup dict) and master/employee_airports.parquet
    PrmDashboard.PrmService/               # 25 analytics endpoints — queries per-tenant Parquet files via DuckDB
      Services/                            # BaseQueryService + 7 query services (Filter, Record, Ranking,
                                           #   Trend, Breakdown, Kpi, Performance)
      Sql/HhmmSql.cs                       # SQL-expression builder for the HHMM time encoding
    PrmDashboard.Gateway/                  # Ocelot routing + subdomain→X-Tenant-Slug middleware
  tools/
    PrmDashboard.ParquetBuilder/           # Utility: reads CSVs → Parquet via DuckDB COPY (run after editing any seed CSV)
data/                                       # Committed: CSVs are the human-readable seed, Parquet is the query format
  master/                                  # tenants.{csv,parquet}, employees.{csv,parquet}, employee_airports.{csv,parquet}
  {tenant-slug}/                           # prm_services.{csv,parquet} — one folder per tenant
frontend/                                   # Angular 17 SPA (lazy-loaded features, standalone components)
  src/app/
    core/                                  # Singletons: auth, api, theme, progress, stores (Tenant/Auth/Filter/Navigation)
    features/auth/login/                   # Login page (split layout, mouse-parallax dark panel)
    features/home/                         # Home with PRM Dashboard tile
    features/dashboard/                    # 4-tab dashboard (Overview, Top 10, Service Breakup, Fulfillment)
    features/not-found/                    # Editorial 404 — "Flight diverted"
    shared/charts/                         # ECharts wrapper components (6 chart types)
    shared/components/                     # TopBar, AirportSelector, ProgressBar
    shared/directives/                     # [appTooltip] — replaces matTooltip
    shared/pipes/                          # CompactNumberPipe (15.2k / 1.5M / —)
docs/
  e2e-checklist.md                         # Manual verification scenarios
  superpowers/specs/                       # Archived design specs (historical project record)
  superpowers/plans/                       # Archived implementation plans (historical project record)
docker-compose.yml
.env.example
```

## Commands

**Backend:**

```bash
cd backend
dotnet build                               # Build all projects
dotnet run --project src/PrmDashboard.AuthService   # Run a single service locally
```

**Frontend** (Phase 7+):

```bash
cd frontend
npm install
npm start                                  # Dev server on :4200
npm run build                              # Production build
npm test                                   # Karma + Jasmine
```

**Full stack:**

```bash
cp .env.example .env
# Before first run: replace JWT_SECRET in .env — the placeholder is rejected by JwtStartupValidator
docker compose up --build                  # gateway (5000), auth, tenant, prm, frontend (4200)
```

**Refreshing the seed data:**

The CSVs under `data/` are the human-readable source of truth; the sibling `*.parquet` files are what the runtime reads. Edit the CSV, then regenerate:

```bash
# Convert every CSV under ./data to a sibling *.parquet
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data
# Restart services so they pick up the refreshed parquet files
docker compose restart auth tenant prm
```

## Architecture decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-08 | Multi-tenant: master + per-tenant data, each tenant addressable independently | True data isolation; the per-tenant unit is now a Parquet file (`data/{slug}/prm_services.parquet`) but the multi-tenancy contract is unchanged |
| 2026-04-08 | Tenant resolved via subdomain → slug → `X-Tenant-Slug` header | Industry-standard SaaS pattern; gateway owns the slug extraction |
| 2026-04-08 | JWT in memory + httpOnly refresh cookie (15 min / 7 day) | XSS-resistant access tokens, CSRF-resistant refresh |
| 2026-04-08 | Airport-level RBAC enforced on PRM Service middleware | Validates `?airport=…` against JWT `airports` claim; 403 on any mismatch |
| 2026-04-20 | Airport filter accepts comma-separated values (`?airport=DEL,BOM`) | Same wire convention as `airline`/`service`/`handled_by`; `PrmFilterParams.AirportList` parses, `BaseQueryService.BuildWhereClause` switches between equality (single) and `IN` (multi); frontend `FilterStore.airport: string[]` + multi-select airport selector |
| 2026-04-08 | Dedup via `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) = 1` in SQL | Pause/resume creates multiple rows with the same `id`; canonical row = the first (lowest `row_id`) one. Some endpoints use `COUNT(DISTINCT id)` where only the count matters. |
| 2026-04-08 | Duration = sum of active segments per id, computed in SQL via `HhmmSql.ActiveMinutesExpr` | Correctly handles paused/resumed services; `(COALESCE(paused_at, end_time) − start_time)` in minutes, clamped ≥0 |
| 2026-04-08 | Legacy `.sln` (not `.slnx`) solution format | Dockerfile `COPY` patterns expect `.sln`; .NET 10 SDK defaults to `.slnx` |
| 2026-04-08 | ECharts via `ngx-echarts` with shared `BaseChartComponent` | Consistent loading/empty states; never use raw `echarts` in feature components |
| 2026-04-08 | NgRx Signal Store for filters, synced to URL query params | Reload-safe state; cross-tab consistency without React Query |
| 2026-04-21 | Runtime data layer is DuckDB over per-tenant Parquet — no ORM, explicit SQL | DuckDB's native Parquet aggregation handles the dedup-then-aggregate pattern directly in SQL; per-tenant files give natural isolation with zero coupling between tenants. |
| 2026-04-21 | Per-tenant Parquet path is `data/{slug}/prm_services.parquet` — pure string convention | No slug→connection-string lookup needed; `TenantParquetPaths.TenantPrmServices(slug)` is a pure helper |
| 2026-04-21 | Refresh-token store is `InMemoryRefreshTokenStore` (process-local) | POC compromise — tokens are forgotten on restart. Migrate to a durable store before production |
| 2026-04-22 | `BaseQueryService.BuildWhereClause(filters)` returns `(sqlFragment, IReadOnlyList<DuckDBParameter>)` | Single source of truth for filter→SQL translation; every service inlines the fragment into `WHERE {where}` and re-binds parameters |
| 2026-04-22 | Airport branch: `Length > 1` → `IN`, else → `=` (cleaner SQL for the common single-airport case) | Both branches produce identical rows; the equality form is more readable and gives the planner a direct lookup. Established in `BuildWhereClause`; mirrored at every other site. |
| 2026-04-22 | `::INT` casts on `COUNT(*)` and `SUM(CASE…)`; `::DOUBLE` cast on `SUM(integer_arithmetic)` feeding `Convert.ToDouble`/`quantile_cont` | DuckDB.NET returns BigInteger from those expressions and `Convert.ToInt32`/`ToDouble` cannot unbox a BigInteger. The casts are at column-alias level only, never inside arithmetic where they'd truncate floating-point results. |
| 2026-04-22 | DuckDB integer division uses `//` (not `CAST(x/100 AS INTEGER)`) in HhmmSql | DuckDB's `/` on integer literals returns DOUBLE, and `CAST(DOUBLE AS INTEGER)` rounds rather than truncates — `2359/100` would yield `24` not `23`. The `//` operator forces truncating integer division. |
| 2026-04-22 | TenantService no longer exposes `/resolve/{slug}` | Phase 3d-2 — endpoint had zero callers after PrmService migrated to DuckDB. Removed along with its `LegacyTenantResolveData` record and `TenantResolveResponse` DTO. |
| 2026-04-22 | `TenantSlugClaimCheckMiddleware` requires both presence AND match of `X-Tenant-Slug` for any authenticated request with a `tenant_slug` claim | Defense-in-depth: a request without the gateway's injected header has bypassed the gateway entirely and shouldn't reach a controller. 400 on missing, 403 on mismatch. |
| 2026-04-22 | `TenantParquetNotFoundException` → 404 mapping in `ExceptionHandlerMiddleware` | A newly provisioned tenant whose data hasn't been generated yet returns a typed Not Found rather than an opaque DuckDB IO error → 500. Restores the legacy 404 behaviour. |
| 2026-04-22 | `JwtStartupValidator` in `Shared/Extensions` called from all 4 `Program.cs` | Enforces three invariants at startup: (a) `Jwt:Secret` is non-empty (AuthService had `?? throw` which accepted `""`); (b) rejects the `change-in-production` placeholder shipped in `.env.example`/compose fallback; (c) requires ≥32-byte secrets for HS256. Fails fast with a clear error rather than silently running with a zero-byte or publicly-known key. |
| 2026-04-22 | Phase 3d-2 — `TenantService /resolve/{slug}` endpoint deleted | Endpoint had zero callers after PrmService migrated to DuckDB. Removed along with its `LegacyTenantResolveData` record and `TenantResolveResponse` DTO. |
| 2026-04-23 | HHMM truncation uses `//` everywhere (including `TrendService.GetHourlyAsync`) | One heatmap query had slipped through with `CAST(start_time / 100 AS INTEGER)`; `start_time=2359` would round to hour=24 and be silently dropped from the 7×24 grid. `BaseQueryService.ResolveTenantParquet(slug)` + `Convert.ToInt32` on scalar reads are enforced across all 25 endpoints. Regression test seeds `start_time=2359` and pins hour=23. |
| 2026-04-23 | Tenant slug format validated at `TenantParquetPaths.TenantPrmServices(slug)` | Regex `^[a-z][a-z0-9-]{0,49}$` — blocks path-traversal sequences (`../etc`, `foo/bar`, `foo\bar`) before `Path.Combine`. Defense-in-depth; the gateway + login flow already filter slugs in practice but this is the last line before filesystem operations. |
| 2026-04-23 | `ClockSkew = TimeSpan.Zero` on all JWT validators (Auth/Tenant/Prm/Gateway) | Default 5-min skew silently extended the 15-min access-token lifetime to 20. Making the documented lifetime the real bound. |
| 2026-04-23 | Middleware writes `ProblemDetails` via `WriteAsync` + pre-serialised JSON, not `WriteAsJsonAsync` | `WriteAsJsonAsync` silently overwrote the `application/problem+json` content-type back to `application/json`. Uncovered by the new WebApplicationFactory middleware tests. |
| 2026-04-23 | `WebApplicationFactory<PrmServiceEntryPoint>` integration tests for the 3 PrmService middlewares | 8 tests covering 401/400/403/404/200 at the HTTP boundary (`TenantSlugClaimCheckMiddleware`, `AirportAccessMiddleware`, `ExceptionHandlerMiddleware`). Uses a namespaced `PrmServiceEntryPoint` anchor class because multiple projects define a global `Program`. |
| 2026-04-23 | Backend containers run as non-root (`USER app`) with per-service `HEALTHCHECK` | The aspnet:8.0 base image ships a non-root `app` user; previously ignored. Healthchecks live in both Dockerfile (for k8s / standalone) and compose (for dependency ordering). Gateway `depends_on` upgraded from `service_started` to `service_healthy` so it doesn't accept traffic before auth/tenant/prm finish initialising. |
| 2026-04-23 | `ASPNETCORE_ENVIRONMENT` in compose is `${ASPNETCORE_ENVIRONMENT:-Development}` | Was hardcoded to `Development`, which exposed Swagger UI through the gateway in every deployment. CI/CD can now override via env. |
| 2026-04-23 | Frontend ESLint wired up (`@angular-eslint@17` + `@typescript-eslint@7` + `eslint@8`) with `npm run lint` | Previously the rule file said "ng lint must pass" but no tooling was installed. Baseline: 0 errors, 28 warnings (all `no-explicit-any` in intentional ECharts handlers). |
| 2026-04-23 | Frontend `forkJoin` subscribe results are type-inferred (not `(r: any)`) | Every dashboard tab discarded the typed DTO shape at the `next:` handler. Type-check now catches a backend DTO change at compile time. |
| 2026-04-23 | All Dockerfile base images pinned to sha256 digests (`mcr.microsoft.com/dotnet/{sdk,aspnet}:8.0@sha256:…`, `node:20-alpine@sha256:…`, `nginx:alpine@sha256:…`) | Tag-only references are mutable — a rebuild six months from now could silently pull a different image and break the build or change runtime behaviour. Digest pins make Docker images reproducibility guarantees. |
| 2026-04-23 | CSVs + Parquet under `data/` are committed; ParquetBuilder is the only data tool | Seed data is the human-readable source of truth in git; regenerate Parquet with `dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data` after editing any CSV. Simpler than an external DB seed pipeline and requires no setup on a fresh clone. |

## Conventions

**Backend (.NET):**

- Controllers thin, delegate to Services
- Raw DuckDB SQL via `IDuckDbContext.AcquireAsync` + `DuckDBParameter`; never construct `DuckDBConnection` by hand
- Filter composition through `BaseQueryService.BuildWhereClause` (single source of truth for `PrmFilterParams` → SQL)
- Path resolution through `BaseQueryService.ResolveTenantParquet(slug)` (handles existence check + escape; throws typed `TenantParquetNotFoundException` mapped to 404)
- Use `record` types for DTOs (immutable by default)
- `BCrypt.Net` for password hashing
- `ILogger<T>` with structured fields
- `ProblemDetails` for error responses
- One class per file (except DTO files which group related records per the plan)
- `Convert.ToInt32(reader.GetValue(N))` / `Convert.ToDouble(...)` for scalar reads — never raw `(int)` / `(long)` casts (DuckDB.NET may return Int64 or BigInteger for what looks like an int)

**Frontend (Angular):**

- Standalone components only — no NgModules
- NgRx Signal Store for shared state, component signals for local state
- All API calls go through `ApiClient` (never direct `HttpClient`)
- All charts wrap `BaseChartComponent`
- Filters synced to URL query params via `FilterStore.queryParams()`
- Lazy-load features via `loadComponent`
- Max 300 lines per file

**Both:**

- Immutable data structures by default
- Descriptive names (`employeeSchedule` not `empSch`)
- Boolean vars prefixed: `is`, `has`, `can`, `should`
- Comments explain WHY, not WHAT

## Claude Code infrastructure

**Rules** (`.claude/rules/`):

- `architecture.md` — system architecture, component responsibilities, data flow (PRM-specific)
- `dotnet-backend.md` — .NET 8 conventions, DuckDB + Parquet patterns, multi-tenant access, JWT auth, anti-patterns
- `angular-frontend.md` — Angular 17 standalone-component conventions, NgRx Signal Store, ECharts wrappers, RBAC patterns

**Skills** (`.claude/skills/`):

- `prm-domain/` — PRM domain knowledge: IATA SSR codes (WCHR/WCHC/MAAS/etc.), HHMM time encoding, pause/resume dedup pattern, common SQL aggregations, time-of-day patterns, airline region color coding. **Use this whenever writing dashboard queries, charts, or any code that touches `prm_services` data.**

## How Claude should use this infrastructure

**Before any new feature work:**

1. Read the relevant rule file (`dotnet-backend.md` or `angular-frontend.md`) for the layer you're touching
2. Invoke the `prm-domain` skill if the work touches PRM data, queries, charts, or dashboards
3. Skim the **Architecture decisions** table above to avoid contradicting prior choices

**When making a non-trivial decision:**

- Add a dated row to the **Architecture decisions** table above with the rationale
- If the decision affects a rule file (e.g., changes a coding convention), update the relevant rule too

## Multi-tenant onboarding

When adding a new tenant, the flow is:

1. Append a row to `data/master/tenants.csv` — `id`, `slug`, `name`, `is_active`, `created_at`, `logo_url`, `primary_color`.
2. Append the tenant's employees to `data/master/employees.csv` and their airport assignments to `data/master/employee_airports.csv`.
3. Create the tenant's own `data/{slug}/prm_services.csv` with the columns documented in README → "Per-tenant data".
4. Run `dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data` to refresh every sibling `*.parquet`.
5. Restart `tenant` and `auth` services so `TenantsLoader.StartAsync` picks up the new tenant in its startup dictionary. (`prm` doesn't need a restart — it computes the path lazily per request.)
6. Point `{slug}.prm-app.com` at the Angular app.

**If the parquet is missing** at request time (e.g., new tenant onboarded but Parquet hasn't been rebuilt yet), the request returns **404 Not Found** via `TenantParquetNotFoundException`, not a 500.

**Schema evolution:** The Parquet schema IS the schema — there's no `SchemaMigrator`. To evolve a column: edit the column in the relevant CSV, then re-run `PrmDashboard.ParquetBuilder`. Extra columns in a Parquet file are ignored by DuckDB; missing columns break the read.

## Windows-specific notes

- Git Bash is the shell; use forward slashes in paths
- Line endings: LF in repo, CRLF on checkout (default). Ignore LF→CRLF warnings from git
- Do NOT use bash heredocs for file creation (Windows EEXIST bug — use the Write tool instead)
- `dotnet`, `docker`, `gh`, `node`, `npm` all available on PATH

## Current status

POC feature-complete. Runtime data layer is DuckDB over per-tenant Parquet; seed CSVs + generated Parquet are committed under `data/`. **172/172 backend + 1/1 frontend tests passing.** Build clean.

### Capability snapshot

| Area | Status | Notes |
|---|---|---|
| **Infrastructure** | ✅ | `.NET` solution + Shared library, Docker Compose, per-service Dockerfiles + healthchecks, non-root `USER app`, base images pinned by sha256 digest |
| **Auth Service** | ✅ | BCrypt password hash, 15-min JWT, 7-day httpOnly refresh cookie (`InMemoryRefreshTokenStore`), atomic refresh rotation, `ClockSkew = TimeSpan.Zero`, `JwtStartupValidator` |
| **Tenant Service** | ✅ | `/config` + `/airports`; `TenantsLoader` startup dict from `master/tenants.parquet` |
| **PRM Service** | ✅ | 25 analytics endpoints over DuckDB; `BaseQueryService.BuildWhereClause`; `HhmmSql` time helpers; airport RBAC middleware |
| **Gateway** | ✅ | Ocelot routing, subdomain → `X-Tenant-Slug` header, `depends_on: service_healthy` for auth/tenant/prm |
| **Seed data** | ✅ | 3 tenants, 12 employees, ~20k PRM records across Dec 2025 – Mar 2026. Committed as CSVs under `data/`; Parquet refreshed via `PrmDashboard.ParquetBuilder` |
| **Frontend** | ✅ | Angular 17 standalone, NgRx Signal Store, 5-tab dashboard, 6 ECharts wrappers, `@angular-eslint` lint gate, production build clean |
| **Test coverage** | ✅ | 172 backend (unit + fixture-backed DuckDB + `WebApplicationFactory` middleware integration) + 1 frontend sanity test |

### Hardening (2026-04-22 → 2026-04-23)

Three-agent code review surfaced ~40 findings across backend / frontend / ops. Highlights:

- **Real bugs fixed:** HHMM heatmap `CAST` rounding silently dropped 23:59 data; `(int)total` cast silently truncating at scale; `WriteAsJsonAsync` clobbering `application/problem+json` content-type.
- **Security:** `JwtStartupValidator` (length + placeholder + non-empty), slug path-traversal guard at `TenantParquetPaths.TenantPrmServices`, `ClockSkew = TimeSpan.Zero` on every validator, CORS empty-allowlist startup warning, non-root `USER app` in all backend Dockerfiles.
- **Ops:** `backend/.dockerignore`, per-service `HEALTHCHECK` in Dockerfiles + compose, gateway `depends_on: service_healthy`, `ASPNETCORE_ENVIRONMENT` override-able via env, all Dockerfile base images pinned to sha256 digests.
- **Test coverage:** 40 new backend tests — `WebApplicationFactory` integration for the 3 PrmService middlewares (8), `JwtStartupValidator` unit (9), `TenantParquetPaths` slug validation (22), heatmap-boundary regression (1).
- **Frontend tooling:** `@angular-eslint@17` + `@typescript-eslint@7` + `eslint@8` wired up; scaffold spec replaced with a real sanity test; `forkJoin` results now type-inferred; `tailwindcss` + `postcss` dead deps removed; `pocToday: ''` in production falls back to real `new Date()`.
- **Dead code:** `Employee.tenantId` removed, three copies of `EscapeSingleQuotes` consolidated to `TenantParquetPaths.EscapeSqlLiteral`.

Last updated: 2026-04-23.
