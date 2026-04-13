# CLAUDE.md — PRM Dashboard

Project instructions for Claude Code working in this repo. Inherits from `dev-ai/CLAUDE.md` (parent global preferences); this file overrides where they conflict.

## What this project is

Multi-tenant PRM (Passenger with Reduced Mobility) analytics POC for airport ground-handling operations. See [README.md](README.md).
  
## Tech stack (authoritative)

| Layer | Tech |
|---|---|
| Backend runtime | .NET 8 |
| Backend framework | ASP.NET Core Web API |
| ORM | Entity Framework Core 8 with Pomelo MySQL provider (`Pomelo.EntityFrameworkCore.MySql` 8.0.2) |
| Raw SQL / migrations | `MySqlConnector` 2.3.7 (used by `SchemaMigrator` in TenantService) |
| Auth | `BCrypt.Net-Next` (password hashing), `System.IdentityModel.Tokens.Jwt` (JWT) |
| API Gateway | Ocelot (latest for .NET 8) |
| Frontend framework | Angular 17+ (standalone components, no NgModules) |
| UI library | Angular Material 3 (custom theme) |
| Charts | Apache ECharts via `ngx-echarts` |
| Frontend state | NgRx Signal Store (`@ngrx/signals`) |
| Database | MySQL 8.0 |
| Container orchestration | Docker Compose |

**Shared library** (`backend/src/PrmDashboard.Shared/`) holds the EF entity models, DTOs, and pure helper functions. All 4 microservices reference it. Never add business logic there — just data shapes.

## Key directories

```
backend/
  PrmDashboard.sln                         # Legacy .sln (not .slnx) for Dockerfile compatibility
  src/
    PrmDashboard.Shared/                   # Entities + DTOs + TimeHelpers (no business logic)
      Models/                              # Tenant, Employee, EmployeeAirport, RefreshToken, PrmServiceRecord
      DTOs/                                # 9 DTO files grouped by domain
      Extensions/                          # TimeHelpers (HHMM integer encoding)
    PrmDashboard.AuthService/              # Login, refresh, logout, /me — owns employees + refresh_tokens
    PrmDashboard.TenantService/            # Tenant resolution + SchemaMigrator — owns tenants + employee_airports
      Schema/Migrations/                   # Embedded SQL migration files (001_..., 002_..., etc.)
    PrmDashboard.PrmService/               # 19 analytics endpoints — queries per-tenant DBs
    PrmDashboard.Gateway/                  # Ocelot routing + subdomain→X-Tenant-Slug middleware
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
database/
  init/                                    # Runs once on MySQL container boot
    01-master-schema.sql                   # Master DB schema
    02-tenant-schema.sql                   # Creates 3 POC tenant DBs + initial prm_services table
    03-seed-tenants.sql                    # (Phase 6) Seed 3 tenants
    04-seed-employees.sql                  # (Phase 6) Seed 12 employees + airport assignments
    05-seed-prm-data.sql                   # (Phase 6) Generated via Python script, ~15k rows total
docs/
  e2e-checklist.md                         # Manual verification scenarios
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
docker compose up --build                  # All 6 services (mysql, gateway, auth, tenant, prm, frontend)
```

**Database:**

```bash
docker compose up mysql -d
docker compose exec mysql mysql -uroot -prootpassword -e "SHOW DATABASES;"
```

## Architecture decisions

| Date | Decision | Why |
|---|---|---|
| 2026-04-08 | Multi-tenant with master DB + per-tenant DBs | True data isolation; each tenant can live on a different MySQL instance |
| 2026-04-08 | Tenant resolved via subdomain → slug → `X-Tenant-Slug` header | Industry-standard SaaS pattern; gateway owns the slug extraction |
| 2026-04-08 | JWT in memory + httpOnly refresh cookie (15 min / 7 day) | XSS-resistant access tokens, CSRF-resistant refresh |
| 2026-04-08 | Airport-level RBAC enforced on PRM Service middleware | Validates `?airport=X` against JWT `airports` claim; 403 on mismatch |
| 2026-04-08 | Dedup via `COUNT(DISTINCT id)` in `prm_services` | Pause/resume creates multiple rows with the same `id`; each service counts once |
| 2026-04-08 | Duration = sum of active segments per id (SQL-level) | Correctly handles paused/resumed services |
| 2026-04-08 | AES-256 at rest for tenant DB credentials in master DB | Credentials are high-value targets; encryption is cheap |
| 2026-04-08 | Runtime schema migration via `SchemaMigrator` in TenantService | Attach a new tenant DB → first request auto-applies embedded SQL migrations |
| 2026-04-08 | Migration file naming: `001_create_prm_services.sql` | Zero-padded ordinal + snake_case; lexicographic sort = execution order |
| 2026-04-08 | Never edit a committed migration file — always add a new one | Applied migrations are immutable facts in `schema_migrations` tracker |
| 2026-04-08 | Legacy `.sln` (not `.slnx`) solution format | Dockerfile `COPY` patterns expect `.sln`; .NET 10 SDK defaults to `.slnx` |
| 2026-04-08 | MySQL healthcheck uses authenticated `mysqladmin ping -u root -p$PWD` | Anonymous ping can pass before init scripts complete on MySQL 8 |
| 2026-04-08 | ECharts via `ngx-echarts` with shared `BaseChartComponent` | Consistent loading/empty states; never use raw `echarts` in feature components |
| 2026-04-08 | NgRx Signal Store for filters, synced to URL query params | Reload-safe state; cross-tab consistency without React Query |

## Conventions

**Backend (.NET):**

- Controllers thin, delegate to Services
- EF Core 8 style (`select()`, `Session.execute()`, no legacy `query()`)
- Use `record` types for DTOs (immutable by default)
- `BCrypt.Net` for password hashing
- `ILogger<T>` with structured fields
- `ProblemDetails` for error responses
- One class per file (except DTO files which group related records per the plan)

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
- `dotnet-backend.md` — .NET 8 conventions, EF Core patterns, multi-tenant access, JWT auth, MySqlConnector, anti-patterns
- `angular-frontend.md` — Angular 17 standalone-component conventions, NgRx Signal Store, ECharts wrappers, RBAC patterns
- `agents.md` — when to delegate to which subagent
- `coding-style.md`, `development-workflow.md`, `git-workflow.md`, `security.md`, `testing.md`, `performance.md` — language-agnostic engineering principles
- `memory-decisions.md` — dated technical decisions log (PRM entries from 2026-04-08)
- `memory-sessions.md` — running session log (newest at top)
- `memory-profile.md`, `memory-preferences.md`, `memory-private.md` — user/personal context
- `auto-sync.md` — rule that CLAUDE.md stays in sync with actual code structure

**Skills** (`.claude/skills/`):

- `prm-domain/` — PRM domain knowledge: IATA SSR codes (WCHR/WCHC/MAAS/etc.), HHMM time encoding, pause/resume dedup pattern, common SQL aggregations, time-of-day patterns, airline region color coding. **Use this whenever writing dashboard queries, charts, or any code that touches `prm_services` data.**

**Hooks** (`.claude/hooks/`):

- `check-sync.sh` — post-task hook that detects drift between `.claude/` files and `CLAUDE.md` (warns if a rule/skill/agent/hook exists but isn't mentioned here)
- `stop-reflect.sh` — post-task reflection hook

**Agents** (`.claude/agents/`):

- `planner` — breaks features into implementation steps with file changes. Use for "plan", "implement", "add feature", "build"
- `architect` — makes system design decisions with documented tradeoffs. Use for "design", "architecture", "how should I structure"
- `code-reviewer` — reviews code quality, security, maintainability. Use after implementing a feature, before committing

## How Claude should use this infrastructure

**Before any new feature work:**

1. Read the relevant rule files (`dotnet-backend.md` or `angular-frontend.md` based on the layer)
2. Invoke the `prm-domain` skill if the work touches PRM data, queries, charts, or dashboards
3. Check `memory-decisions.md` to understand prior architectural choices and avoid contradicting them

**Before delegating a task:**

- See `.claude/rules/agents.md` for which subagent to use
- For executing the implementation plan task-by-task, use `superpowers:subagent-driven-development`

**When making a non-trivial decision:**

- Add a dated entry to `memory-decisions.md` with the rationale
- If the decision affects rule files (e.g., changes a coding convention), update the relevant rule file too

**After completing substantive work:**

- Add a one-line entry to `memory-sessions.md` (newest at top)
- The `check-sync.sh` hook will warn if you added a new rule/skill/agent/hook without mentioning it here

## Multi-tenant onboarding

When adding a new tenant, the flow is:

1. Create empty MySQL database on any reachable host (can be a different instance than the master)
2. `INSERT INTO prm_master.tenants (...)` with its connection info
3. `INSERT` employees + `employee_airports` rows
4. Point `{slug}.prm-app.com` at the Angular app
5. First request triggers `SchemaMigrator.RunAsync()` which auto-applies embedded SQL migrations

**Schema evolution:** Never edit `database/init/02-tenant-schema.sql` after initial POC launch. Instead, drop a new file in `backend/src/PrmDashboard.TenantService/Schema/Migrations/` (e.g., `002_add_cost_center.sql`), commit, deploy. All tenants receive it on next request.

## Windows-specific notes

- Git Bash is the shell; use forward slashes in paths
- Line endings: LF in repo, CRLF on checkout (default). Ignore LF→CRLF warnings from git
- Do NOT use bash heredocs for file creation (Windows EEXIST bug — use the Write tool instead)
- `dotnet`, `docker`, `gh`, `node`, `npm` all available on PATH

## Current status

| Phase | Tasks | Status | Notes |
|---|---|---|---|
| **1. Infrastructure** | T1 Docker+MySQL init, T2 .NET solution + Shared library | ✅ **Complete** (commits `49543ce`, `92363af`, `5f5ac6e`, `f27cdd3`, `b98c806`) | docker-compose with 6 services, master DB schema, 3 tenant DBs, 5 EF entities, 9 DTO files, TimeHelpers |
| **2. Auth Service** | T3 project setup + DbContext, T4 JWT + login/refresh/logout/me | ✅ **Complete** | BCrypt password hashing, 15-min JWT, 7-day httpOnly refresh cookie, `BCRYPT_PENDING:` bootstrap convention, atomic refresh rotation |
| **3. Tenant Service** | T5 resolution + SchemaMigrator + 3 endpoints | ✅ **Complete** | Runtime tenant onboarding via embedded versioned migrations, 5-min connection cache, semaphore-guarded migration |
| **4. PRM Service** | T6 setup + tenant DB factory, T7 KPI/filter endpoints, T8 trends/rankings/breakdowns/performance/records | ✅ **Complete** | 23 endpoints (19 analytics + filter + 3 KPI), airport RBAC middleware, dedup queries, PrmControllerBase, global exception handler |
| **5. API Gateway** | T9 Ocelot routing + subdomain middleware | ✅ **Complete** | Ocelot 23.4.2, tenant extraction middleware (subdomain/header/query fallback), 3 routes, /health endpoint |
| **6. Seed data** | T10 SQL seeds + Python PRM data generator | ✅ **Complete** | 3 tenants, 12 employees, ~17k PRM records (Dec 2025–Mar 2026), deterministic generator |
| **7. Frontend core** | T11 Angular scaffolding, T12 auth + stores + interceptor | ✅ **Complete** | Angular 17, NgRx Signal Store, ApiClient, AuthInterceptor with 401 auto-refresh, tenant resolver |
| **8. Frontend pages** | T13 login, T14 home + topbar, T15 dashboard shell + chart wrappers, T16-19 4 dashboard tabs | ✅ **Complete** | Login (split layout), home tile, 4 tabs with 6 chart wrappers, filter bar, KPI cards |
| **9. Integration & polish** | T20 E2E checklist, T21 .claude config sync | ✅ **Complete** | E2E checklist with multi-tenant, RBAC, auth, navigation, all 4 tabs, filters, edge cases |

**POC is feature-complete.** All 21 tasks across 9 phases implemented and reviewed.

Last updated: 2026-04-13 (dashboard UI polish: chart axis labels + units, agents table "Most Serviced" column)
