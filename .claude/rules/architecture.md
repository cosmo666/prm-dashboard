# PRM Dashboard — Architecture

## Why this architecture exists

PRM Dashboard is a multi-tenant analytics POC for airport ground-handling companies managing Passenger with Reduced Mobility services. Each ground handler (AeroGround, SkyServe, GlobalPRM, etc.) is a separate tenant with its own isolated database. The POC demonstrates that new tenants can be onboarded at runtime by attaching a database — no code changes, no restarts.

## System diagram

```
                          Browser (Angular 17)
                                    │
                                    │ HTTPS
                                    ▼
                    ┌───────────────────────────────┐
                    │   API Gateway (Ocelot)        │  port 5000
                    │   - Extracts subdomain        │
                    │   - Adds X-Tenant-Slug        │
                    │   - Validates JWT             │
                    └──────────────┬────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
      ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
      │  Auth Service    │ │  Tenant Service  │ │   PRM Service    │
      │  (port 5001)     │ │  (port 5002)     │ │   (port 5003)    │
      │  - login/refresh │ │  - resolve slug  │ │  - 19 endpoints  │
      │  - /me           │ │  - SchemaMigrator│ │  - Airport RBAC  │
      │  - employees     │ │  - tenant config │ │  - dedup queries │
      └─────────┬────────┘ └─────────┬────────┘ └─────────┬────────┘
                │                    │                    │
                └───────────┬────────┴────────────┬───────┘
                            │                     │
                            ▼                     ▼
                  ┌──────────────────┐  ┌──────────────────────┐
                  │  Master MySQL    │  │ Tenant 1 DB          │
                  │  prm_master      │  │ aeroground_db        │
                  │  - tenants       │  │ - prm_services       │
                  │  - employees     │  │ - schema_migrations  │
                  │  - airports      │  └──────────────────────┘
                  │  - refresh_tokens│  ┌──────────────────────┐
                  └──────────────────┘  │ Tenant 2 DB          │
                                        │ skyserve_db          │
                                        │ (can be on a         │
                                        │  different MySQL     │
                                        │  instance)           │
                                        └──────────────────────┘
                                        ┌──────────────────────┐
                                        │ Tenant 3 DB          │
                                        │ globalprm_db         │
                                        └──────────────────────┘
```

## Component responsibilities

### Gateway (`PrmDashboard.Gateway/`)

- Extracts tenant slug from `Host` header (e.g., `aeroground` from `aeroground.prm-app.com`)
- Adds `X-Tenant-Slug` header to all downstream requests
- Validates JWT signature and expiry on authenticated routes
- Routes `/api/auth/**`, `/api/tenants/**`, `/api/prm/**` to the correct upstream service
- Public routes: `/api/auth/login`, `/api/auth/refresh`, `/api/tenants/config`

### Auth Service (`PrmDashboard.AuthService/`)

- Owns: `employees` and `refresh_tokens` tables in master DB
- Endpoints: `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`
- Issues short-lived access tokens (15 min) + long-lived refresh tokens (7 days, httpOnly cookie)
- Passwords hashed with BCrypt.Net-Next (work factor 11)

### Tenant Service (`PrmDashboard.TenantService/`)

- Owns: `tenants` and `employee_airports` tables in master DB
- Endpoints: `GET /resolve/{slug}` (internal), `GET /airports` (authed), `GET /config` (public — for login page branding)
- **SchemaMigrator** — applies embedded SQL migrations to tenant DBs on cache miss, enabling runtime tenant onboarding
- Decrypts tenant DB passwords with AES-256 before returning connection strings
- In-memory 5-minute cache keyed on slug

### PRM Service (`PrmDashboard.PrmService/`)

- Queries per-tenant databases — no state of its own
- 19 endpoints in 6 groups: KPIs, Trends, Rankings, Breakdowns, Performance, Records
- **Airport access middleware** validates `?airport=X` against JWT `airports` claim; 403 on mismatch
- All dedup aggregations use `COUNT(DISTINCT id)` to handle pause/resume rows correctly

### Frontend (`frontend/`)

- Angular 17 SPA with 3 top-level routes: `/login`, `/home`, `/dashboard`
- Tenant branding loaded from subdomain → `GET /api/tenants/config`
- 4 dashboard tabs with ~17 interactive ECharts visualizations
- NgRx Signal Store for tenant, auth, and filter state (filter state synced to URL)

## Key architectural principles

1. **Multi-tenant via isolated databases** — each tenant has its own DB, optionally on a different MySQL instance. No shared tables except the master DB
2. **Runtime tenant onboarding** — attach a DB, insert a row in `prm_master.tenants`, schema bootstraps on first request via embedded migrations
3. **Stateless services** — every service can scale horizontally; state lives in DBs and the httpOnly refresh cookie
4. **JWT in memory, refresh in httpOnly cookie** — XSS-resistant access tokens, CSRF-resistant refresh
5. **Airport-level RBAC** — finer than role-based; each employee has an explicit list of airports they can see
6. **Dedup at the SQL layer** — pause/resume creates multiple rows per service; analytics aggregate by `id` not `row_id`
7. **Duration handling** — sum of active segments per service id, handled in SQL
8. **No hardcoded tenants** — not in code, not in config, not in the UI. Everything flows from the master DB
9. **Schema evolution via immutable migrations** — never edit a committed migration file; always add a new one
10. **Gateway is the tenant boundary** — the gateway extracts the slug and hands it to services via header. Services never parse subdomains themselves

## Data flow for a typical dashboard request

1. User on `aeroground.prm-app.com` clicks "Month to Date" preset
2. Angular `DashboardComponent` updates `FilterStore`, which fires an effect
3. `OverviewComponent` subscribes to the effect and calls `PrmDataService.kpisSummary()`
4. `ApiClient` adds `Authorization: Bearer <jwt>` header and sends `GET /api/prm/kpis/summary?airport=BLR&date_from=...&date_to=...`
5. Gateway extracts `aeroground` from `Host`, adds `X-Tenant-Slug: aeroground`, validates JWT, forwards to PRM Service
6. PRM Service's Airport Access middleware checks `airport=BLR` against JWT `airports` claim — passes
7. PRM Service calls `TenantService.ResolveAsync("aeroground")` (cached after first call)
8. On cache miss, TenantService decrypts password, builds connection string, invokes `SchemaMigrator.RunAsync(cs)` which is a no-op since the DB is already migrated
9. PRM Service opens a `DbContext` or `MySqlConnection` against `aeroground_db`, runs the aggregation SQL, maps to `KpiSummaryResponse`
10. Response flows back through the gateway, Angular updates signals, charts re-render

## Extractable components

| Component | Reusable as |
|-----------|-------------|
| `SchemaMigrator` | General-purpose per-tenant migration runner for any multi-tenant .NET service |
| Airport RBAC middleware | Claim-based fine-grained authorization pattern |
| `BaseChartComponent` family | ECharts wrappers for any Angular dashboard |
| `FilterStore` + URL sync | Filter state pattern for any query-driven UI |
| Dedup SQL pattern | Any domain with paused/resumed records sharing a business key |

## File map

| Layer | Location |
|-------|----------|
| Backend solution | `backend/PrmDashboard.sln` |
| Shared library | `backend/src/PrmDashboard.Shared/` |
| 4 microservices | `backend/src/PrmDashboard.{AuthService,TenantService,PrmService,Gateway}/` |
| Tenant migrations | `backend/src/PrmDashboard.TenantService/Schema/Migrations/*.sql` |
| Frontend app | `frontend/src/app/` |
| SQL init scripts | `database/init/*.sql` |
| Spec | `docs/superpowers/specs/2026-04-08-prm-dashboard-design.md` |
| Plan | `docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md` |
| Infra | `docker-compose.yml`, `.env.example` |

## Decisions log

See `.claude/rules/memory-decisions.md` for the canonical, dated decisions log.
