# PRM Dashboard — Architecture

## Overview

PRM Dashboard is a multi-tenant analytics POC for airport ground-handling Passenger-with-Reduced-Mobility (PRM) services. **Six** containers behind a Docker Compose: an Ocelot gateway, three .NET microservices that read DuckDB-over-Parquet data per tenant, and **two parallel Angular frontends** (v17 + v8) that share the same backend.

```
prm-dashboard/
├── backend/
│   ├── PrmDashboard.sln                 # Legacy .sln format (Dockerfile compatibility)
│   ├── src/
│   │   ├── PrmDashboard.Shared/         # DuckDB abstractions, DTOs, plain data classes, JwtStartupValidator
│   │   ├── PrmDashboard.AuthService/    # /auth — login, refresh, logout, /me
│   │   ├── PrmDashboard.TenantService/  # /tenants — config + airports
│   │   ├── PrmDashboard.PrmService/     # /prm — 25 analytics endpoints over DuckDB
│   │   └── PrmDashboard.Gateway/        # Ocelot routing + subdomain → X-Tenant-Slug
│   ├── tools/PrmDashboard.ParquetBuilder/  # CSV → Parquet via embedded DuckDB
│   └── tests/PrmDashboard.Tests/        # xUnit (157 passing)
├── data/                                # Committed: CSV (seed) + Parquet (query format)
│   ├── master/                          # tenants, employees, employee_airports
│   └── {slug}/                          # prm_services per tenant
├── frontend/                            # Angular 17 SPA — host port 4200 (primary)
│   └── src/app/{core,features,shared}/  # Standalone components, NgRx Signal Store, Material 3
├── frontend-v8/                         # Angular 8 + PrimeNG SPA — host port 4300 (host-app parity)
│   └── src/app/{core,features,shared}/  # NgModules, RxJS BehaviorSubject stores, PrimeNG 8.0.3
├── docker-compose.yml                   # gateway/auth/tenant/prm/frontend/frontend-v8 (+ dev profile)
└── CLAUDE.md
```

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Backend runtime | .NET | 8.0 |
| Backend framework | ASP.NET Core Web API | 8.0 |
| Runtime data layer | DuckDB.NET (`DuckDB.NET.Data` + `Bindings.Full`) | 1.5.0 |
| Storage format | Apache Parquet (committed under `data/`) | - |
| Auth — password hash | BCrypt.Net-Next | 4.0.3 |
| Auth — JWT | System.IdentityModel.Tokens.Jwt | 7.6.2 |
| API Gateway | Ocelot | 23.2.0 |
| Frontend (primary, `frontend/`, :4200) | Angular standalone components + Material 3 + NgRx Signal Store | 17+ |
| Frontend (host-app parity, `frontend-v8/`, :4300) | Angular NgModules + PrimeNG + RxJS BehaviorSubject | 8.2.14 |
| Charts | Apache ECharts via `ngx-echarts` (both frontends) | - |
| Container | Docker Compose (images pinned by sha256) | - |

## Service topology

```
Browser (subdomain.localhost:4200 or :4300)
  │
  ├─► Frontend v17 (nginx, :4200)  [public — Angular 17 + Material 3]
  │        │
  │        └─► /api/* → http://gateway:8080 (over internal Docker network)
  │
  ├─► Frontend v8  (nginx, :4300)  [public — Angular 8 + PrimeNG]
  │        │
  │        └─► /api/* → http://gateway:8080 (over internal Docker network)
  │
  └─► Gateway (Ocelot, :5000)  [public — also a direct API entry point]
        │
        ├── /api/auth/**    → AuthService    [internal]
        ├── /api/tenants/** → TenantService  [internal]
        └── /api/prm/**     → PrmService     [internal]
              │
              └── reads data/{slug}/prm_services.parquet via DuckDB
```

Both frontends are nginx images that proxy `/api/*` to the same gateway over the internal Docker network. The three backend services listen on the internal network only; the gateway is the sole API entry point. `depends_on: service_healthy` keeps the gateway from accepting traffic until auth/tenant/prm pass their healthchecks, and both frontends `depends_on: gateway.service_healthy`.

## Request flow (authenticated dashboard call)

```
GET /api/prm/kpis/summary?airport=DEL&date_from=…&date_to=…
Host: aeroground.prm-app.com
Authorization: Bearer <JWT>

  1. Angular AuthInterceptor             → attaches Bearer token + withCredentials
  2. Ocelot Gateway                      → extracts subdomain → adds X-Tenant-Slug
  3. PrmService middleware chain:
       ├─ CorrelationIdMiddleware        → adds X-Correlation-Id
       ├─ [Authorize] (JwtBearer, ClockSkew=0)
       ├─ TenantSlugClaimCheckMiddleware → 400 if header missing, 403 if header≠claim
       ├─ AirportAccessMiddleware        → 403 if any ?airport= ∉ JWT airports[]
       └─ ExceptionHandlerMiddleware     → maps to RFC 7807 ProblemDetails
  4. KpiService / Ranking / Trend / …
       ├─ ResolveTenantParquet(slug)     → data/{slug}/… or 404
       ├─ BuildWhereClause(filters)      → (sql, params)
       ├─ DuckDB session from pool       → parameterised SELECT
       └─ typed DTO → JSON
```

## Multi-tenant isolation

The unit of isolation is **a Parquet file**: `data/{slug}/prm_services.parquet`. The slug → file path is a pure string function (`TenantParquetPaths.TenantPrmServices`) — no DB lookup, no inter-service HTTP, no shared table with a `tenant_id` column. A misrouted request can't construct another tenant's path.

Slug travels through three checkpoints:

1. **Subdomain** — `TenantResolver` (frontend) reads `window.location.hostname` and computes the slug.
2. **Header** — Ocelot Gateway re-extracts the slug server-side and injects `X-Tenant-Slug`. Browser-supplied headers are ignored.
3. **JWT claim** — `tenant_slug` claim issued at login.

`TenantSlugClaimCheckMiddleware` requires both the gateway header and the JWT claim to be present and equal. A stolen token replayed on the wrong subdomain hits a 403.

## Data pipeline

```
data/{slug}/prm_services.csv  ──┐
                                 ├─► PrmDashboard.ParquetBuilder ─► sibling *.parquet
data/master/*.csv               ──┘
                                          (embedded DuckDB COPY … FORMAT 'parquet')
```

CSVs are the human-readable source of truth and are committed. Parquet siblings are also committed for fast clone-and-run. There is no schema migration system — the Parquet *is* the schema. Edit a CSV, re-run the builder, restart the affected services.

## Architectural invariants

The full decision history lives in `CLAUDE.md` → "Architecture decisions" table. The load-bearing invariants:

1. **No ORM.** Raw parameterised SQL via `IDuckDbContext.AcquireAsync`.
2. **`BaseQueryService.BuildWhereClause`** is the only place `PrmFilterParams` becomes SQL.
3. **`BaseQueryService.ResolveTenantParquet(slug)`** is the only way services touch a tenant file.
4. **Dedup canonical**: `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) = 1`.
5. **HHMM truncation** uses `//` integer division — never `CAST(/100 AS INTEGER)` (rounds).
6. **Filesystem-level tenant isolation** — no shared tables.
7. **15-min JWT, 7-day refresh cookie**; `ClockSkew = TimeSpan.Zero` everywhere.
8. **Airport RBAC enforced server-side** before any controller action.

## Frontend architecture

Two implementations, one set of contracts. Common to both:

| Concern | Both frontends |
|---|---|
| HTTP | All calls via `ApiClient` → wraps `HttpClient` with `/api` prefix + `withCredentials` |
| Auth | Access token in memory (never `localStorage`), refresh token in httpOnly cookie. Interceptor auto-refreshes on 401 |
| Filter sync | Store ↔ URL query params, reload-safe and shareable |
| Charts | Wrap a `BaseChartComponent` (loading / empty / hover layout). Six wrappers: bar, donut, line, horizontal-bar, sankey, heatmap |
| DTOs | Mirror backend C# records exactly (camelCase on the wire). Authoritative source: `backend/src/PrmDashboard.Shared/DTOs/*.cs` |

Where they differ:

| Concern | Angular 17 (`frontend/`, :4200) | Angular 8 (`frontend-v8/`, :4300) |
|---|---|---|
| Components | Standalone, `loadComponent` lazy loading | NgModules, `loadChildren: () => import(...)` |
| Shared state | NgRx Signal Store (`@ngrx/signals`) | Plain RxJS `BehaviorSubject` services |
| Local state | Component signals + `computed()` | `Observable` + `async` pipe, manual `takeUntil(this.destroy$)` |
| UI library | Angular Material 3 (custom theme) | PrimeNG 8.0.3 (`.ui-*` selectors), PrimeFlex |
| Tooltip | Custom `[appTooltip]` directive | `pTooltip` from PrimeNG |
| Lint | ESLint + `@angular-eslint` | TSLint + codelyzer |
| Build | Angular CLI 17 (Vite) on Node 20 | Angular CLI 8.3 (webpack 4) on Node 12 — dev container only |

See [`angular-frontend.md`](angular-frontend.md) (v17) and [`angular-v8-frontend.md`](angular-v8-frontend.md) (v8) for the full conventions.

## Anti-patterns to reject

- EF Core, `DbContext`, `IQueryable`, or `OnModelCreating` anywhere
- Cross-service HTTP for tenant resolution
- Caching layers between DuckDB and the controller
- Filter logic outside `BuildWhereClause`
- Hardcoded tenant slugs / airport codes / non-IATA service codes
- NgModules in `frontend/` (Angular 17 is standalone-only) — but they're **required** in `frontend-v8/`
- Direct `HttpClient` in feature components (both frontends use `ApiClient`)
- `localStorage` / `sessionStorage` for the access token (both frontends keep it in memory)
