# PRM Dashboard

Multi-tenant analytics POC for **Passenger with Reduced Mobility (PRM)** ground handling services. Airports and ground-handling companies use this to monitor wheelchair assists, medical-assist services, and other accessibility operations across their locations.

> **Status:** POC feature-complete. Original MySQL/EF stack migrated end-to-end to DuckDB + per-tenant Parquet (Phases 1 → 3d-2, completed 2026-04-22). Backend runtime is EF/MySQL-free in source. **132/132 tests passing.** See [docs/e2e-checklist.md](docs/e2e-checklist.md) for verification steps.

## What it does

- **Multi-tenant** — each ground handler (AeroGround, SkyServe, GlobalPRM, ...) has its own isolated dataset, accessed via tenant subdomain (e.g., `aeroground.prm-app.com`)
- **Per-tenant Parquet files** — runtime services read `data/{slug}/prm_services.parquet` directly via DuckDB. The slug → file path mapping is a pure string convention; no database lookup, no inter-service HTTP calls
- **Airport-level RBAC** — employees only see data for airports they're assigned to (enforced by JWT claim + server-side middleware)
- **5-tab dashboard** — Overview, Top 10, Service Breakup, Fulfillment, Insights — with ~17 interactive ECharts visualizations, cross-filtering, drill-down, and 16 date-range presets

---

## Architecture

```text
Browser (Angular 17 SPA)
  | HTTPS
API Gateway (Ocelot, port 5000)
  |-- /api/auth/**    --> Auth Service      (port 5001) -- reads master/employees.parquet
  |-- /api/tenants/** --> Tenant Service    (port 5002) -- reads master/tenants.parquet
  '-- /api/prm/**     --> PRM Service       (port 5003) -- reads data/{slug}/prm_services.parquet
                             |
                   +---------+-----------+
                   |  data/master/       |   tenants.parquet, employees.parquet, employee_airports.parquet
                   |  data/{tenant-1}/   |   prm_services.parquet
                   |  data/{tenant-2}/   |   prm_services.parquet
                   |  data/{tenant-3}/   |   prm_services.parquet
                   +---------------------+
```

Each runtime service uses `DuckDB.NET` to read the Parquet files directly — no ORM, no DbContext, no inter-service HTTP for tenant resolution. The per-tenant data unit is a single Parquet file under `data/{slug}/`. The legacy MySQL stack is retained only as the *source* for the one-shot CSV → Parquet pipeline at `backend/tools/PrmDashboard.{CsvExporter,ParquetBuilder}/`.

Refresh tokens live in `InMemoryRefreshTokenStore` (process-local; restart forgets all sessions — POC compromise).

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend runtime** | .NET | 8.0 |
| **Backend framework** | ASP.NET Core Web API | 8.0 |
| **Runtime data layer** | DuckDB.NET (reading Parquet) | 1.5.0 |
| **Storage format** | Apache Parquet (per-tenant + master files under `data/`) | - |
| **Refresh-token store** | `InMemoryRefreshTokenStore` (process-local) | - |
| **Auth - password hashing** | BCrypt.Net-Next | 4.0.3 |
| **Auth - JWT** | System.IdentityModel.Tokens.Jwt | 7.6.2 |
| **API Gateway** | Ocelot | 23.2.0 |
| **Frontend framework** | Angular (standalone components) | 17+ |
| **UI library** | Angular Material 3 | 17.3 |
| **Charts** | Apache ECharts via ngx-echarts | - |
| **Frontend state** | NgRx Signal Store (@ngrx/signals) | - |
| **Language** | TypeScript (strict mode) | 5.x |
| **Styling** | SCSS with CSS custom properties | - |
| **Legacy data source** | MySQL 8.0 — used only by the one-shot CSV exporter tool, not by runtime services | 8.0 |
| **Container orchestration** | Docker Compose | - |

---

## Multi-Tenant Flow

### How tenant isolation works

```text
1. User visits  aeroground.prm-app.com
                      |
2. Angular TenantResolver extracts slug "aeroground" from subdomain
   Calls GET /api/tenants/config?slug=aeroground
   Stores tenant branding (name, logo, primary color) in TenantStore
                      |
3. User logs in --> POST /api/auth/login
   Headers: X-Tenant-Slug: aeroground
   Body: { username, password }
                      |
4. Auth Service authenticates against master/employees.parquet:
   --> queries WHERE tenant_id = resolved tenant
   --> validates password via BCrypt
   --> issues JWT with claims: sub, tenant_id, tenant_slug, name, airports[]
   --> sets httpOnly refresh cookie (7-day, Secure, SameSite=Strict);
       refresh token stored in process-local InMemoryRefreshTokenStore
                      |
5. Subsequent API calls flow through Ocelot Gateway:
   Gateway middleware extracts subdomain from Host header
   --> sets X-Tenant-Slug request header
   --> forwards to downstream service
                      |
6. PRM Service receives request:
   --> TenantSlugClaimCheckMiddleware verifies X-Tenant-Slug presence + match against JWT claim
   --> AirportAccessMiddleware validates ?airport=X against JWT airports claim (403 on mismatch)
   --> BaseQueryService.ResolveTenantParquet(slug) maps slug to data/{slug}/prm_services.parquet
       (throws TenantParquetNotFoundException -> 404 if file missing)
   --> opens DuckDB session, runs the SQL query against the parquet file
   --> returns data scoped to that tenant only
```

### Tenant resolution chain

```text
Subdomain --> slug (X-Tenant-Slug header) --> data/{slug}/prm_services.parquet --> DuckDB query
```

- **No cross-tenant data leakage** — each request resolves to exactly one tenant's parquet file via a pure string convention.
- **No connection caching** — DuckDB sessions are pooled at the connection level by `IDuckDbContext`; tenant resolution itself is a free string-concatenation, no cache needed.
- **No schema migration** — the Parquet schema IS the schema. To evolve a column, regenerate the affected parquet file via the data pipeline.
- **RBAC enforcement** — PRM Service middleware validates `?airport=X` against the JWT `airports` claim; returns 403 on mismatch. `TenantSlugClaimCheckMiddleware` rejects 400 if the gateway header is missing for any authenticated request.

### Onboarding a new tenant

1. Add a row to `database/init/03-seed-tenants.sql` (master MySQL) with the new tenant's `slug`, `name`, `is_active`, `logo_url`, `primary_color`. (The legacy `db_host`/`db_port`/`db_name`/`db_user`/`db_password` columns are still present in the seed schema but ignored at runtime.)
2. Add employees + airport assignments to `04-seed-employees.sql`.
3. Generate the per-tenant `data/{slug}/prm_services.parquet` file (see "Data regeneration" below).
4. Restart the `auth` and `tenant` services so `TenantsLoader.StartAsync` picks up the new tenant in its startup dictionary. (`prm` doesn't need a restart — it computes the path lazily per request.)
5. Point `{slug}.prm-app.com` DNS at the Angular app.

If a tenant's parquet file is missing at request time (e.g., onboarded but data not generated yet), PRM Service returns **404 Not Found** via `TenantParquetNotFoundException`, not a 500.

---

## Data layout (Parquet runtime + MySQL legacy source)

The runtime services read **Parquet files** under `data/`. The Parquet schema is generated by the `tools/PrmDashboard.ParquetBuilder` pipeline from MySQL exports; the MySQL schema below documents the source-of-truth columns. Parquet column names are snake_case copies of these.

### Master Database (`prm_master`) → `data/master/*.parquet`

#### `tenants` → `data/master/tenants.parquet`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `name` | VARCHAR(100) | NOT NULL |
| `slug` | VARCHAR(50) | NOT NULL, UNIQUE |
| `db_host` | VARCHAR(255) | NOT NULL, DEFAULT 'mysql' (legacy — runtime ignores) |
| `db_port` | INT | NOT NULL, DEFAULT 3306 (legacy — runtime ignores) |
| `db_name` | VARCHAR(100) | NOT NULL (legacy — runtime ignores) |
| `db_user` | VARCHAR(100) | NOT NULL, DEFAULT 'root' (legacy — runtime ignores) |
| `db_password` | VARCHAR(255) | NOT NULL (legacy — runtime ignores) |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `logo_url` | VARCHAR(500) | NULL |
| `primary_color` | VARCHAR(7) | NOT NULL, DEFAULT '#2563eb' |

The five `db_*` columns survive in the parquet file as historical artefacts but no runtime code reads them — Phase 3d-2 deleted the `/api/tenants/resolve/{slug}` endpoint that was their only consumer.

#### `employees`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `tenant_id` | INT | NOT NULL, FK -> tenants(id) CASCADE |
| `username` | VARCHAR(50) | NOT NULL |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `display_name` | VARCHAR(100) | NOT NULL |
| `email` | VARCHAR(100) | NULL |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `last_login` | DATETIME | NULL |

Unique: `(tenant_id, username)`

#### `employee_airports`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `employee_id` | INT | NOT NULL, FK -> employees(id) CASCADE |
| `airport_code` | VARCHAR(10) | NOT NULL |
| `airport_name` | VARCHAR(100) | NOT NULL |

Unique: `(employee_id, airport_code)`

#### `refresh_tokens` (LEGACY — no longer used)

The MySQL `refresh_tokens` table still exists in `database/init/01-master-schema.sql` for historical compatibility, but the runtime AuthService now uses `InMemoryRefreshTokenStore` (process-local). The MySQL table is not read by any runtime service and is not exported to Parquet.

### Per-tenant data → `data/{slug}/prm_services.parquet`

The runtime per-tenant data is one Parquet file per tenant slug. The MySQL legacy schema below is the source for the `tools/PrmDashboard.ParquetBuilder` pipeline; column names map 1:1 to the parquet file's columns (snake_case).

#### `prm_services`

| Column | Type | Constraints |
|---|---|---|
| `row_id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `id` | INT | NOT NULL (source-system PRM service ID, not unique — pause/resume creates multiple rows) |
| `flight` | VARCHAR(20) | NOT NULL |
| `flight_number` | INT | NOT NULL |
| `agent_name` | VARCHAR(100) | NULL |
| `agent_no` | VARCHAR(20) | NULL |
| `passenger_name` | VARCHAR(200) | NOT NULL |
| `prm_agent_type` | VARCHAR(20) | NOT NULL, DEFAULT 'SELF' |
| `start_time` | INT | NOT NULL (HHMM integer encoding, e.g. 1430 = 2:30 PM) |
| `paused_at` | INT | NULL (HHMM) |
| `end_time` | INT | NOT NULL (HHMM) |
| `service` | VARCHAR(20) | NOT NULL (IATA SSR code: WCHR, WCHC, WCHS, WCHP, MAAS, BLND, DEAF, STCR, DPNA) |
| `seat_number` | VARCHAR(10) | NULL |
| `scanned_by` | VARCHAR(50) | NULL |
| `scanned_by_user` | VARCHAR(100) | NULL |
| `remarks` | TEXT | NULL |
| `pos_location` | VARCHAR(50) | NULL |
| `no_show_flag` | VARCHAR(5) | NULL |
| `loc_name` | VARCHAR(10) | NOT NULL (airport IATA code) |
| `arrival` | VARCHAR(10) | NULL |
| `airline` | VARCHAR(10) | NOT NULL (IATA airline code) |
| `emp_type` | VARCHAR(20) | NULL, DEFAULT 'Employee' |
| `departure` | VARCHAR(10) | NULL |
| `requested` | INT | NOT NULL, DEFAULT 0 (1 = pre-requested, 0 = walk-up) |
| `service_date` | DATE | NOT NULL |

Indexes (MySQL source only — Parquet has no indexes; DuckDB scans columns vectorised): `(loc_name, service_date)`, `(service_date, loc_name, airline)`, `(id)`, `(airline)`, `(service)`, `(agent_no)`, `(prm_agent_type)`

**Dedup pattern:** `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) = 1` (canonical) or `COUNT(DISTINCT id)` (count-only) — pause/resume creates multiple rows with the same `id`; the first (lowest `row_id`) is the canonical row holding the service's metadata. Duration = sum of active segments per `id` via `HhmmSql.ActiveMinutesExpr` — `(COALESCE(paused_at, end_time) − start_time)` in minutes, clamped ≥0.

---

## API Reference

All PRM analytics endpoints require `Authorization: Bearer <token>` and accept the following common filter params:

| Query Param | Type | Description |
|---|---|---|
| `airport` | string | Required. IATA airport code (validated against JWT airports claim) |
| `date_from` | date | Start date (YYYY-MM-DD) |
| `date_to` | date | End date (YYYY-MM-DD) |
| `airline` | string | Comma-separated IATA airline codes |
| `service` | string | Comma-separated service types |
| `handled_by` | string | Comma-separated: SELF, OUTSOURCED |
| `flight` | string | Single flight identifier |
| `agent_no` | string | Single agent number |

### Auth Service (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No (needs `X-Tenant-Slug` header) | Login, returns JWT + sets refresh cookie |
| POST | `/api/auth/refresh` | No (uses refresh cookie) | Rotate access token |
| POST | `/api/auth/logout` | Yes | Revoke refresh token, clear cookie |
| GET | `/api/auth/me` | Yes | Current employee profile |

**Login request:** `{ username: string, password: string }`

**Login response:** `{ accessToken: string, employee: { id, displayName, email, airports[] } }`

### Tenant Service (`/api/tenants`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/tenants/config?slug=X` | No | Tenant branding (name, logo, color) — served from startup-loaded dict |
| GET | `/api/tenants/airports` | Yes | Airports assigned to authenticated employee |

(The legacy `/api/tenants/resolve/{slug}` endpoint was removed in Phase 3d-2 — it returned MySQL connection info, which is no longer needed since PrmService computes the per-tenant Parquet path directly.)

### KPI Endpoints (`/api/prm/kpis`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prm/kpis/summary` | Total PRM, active agents, avg/agent/day, avg duration, fulfillment % (with previous period comparisons) |
| GET | `/api/prm/kpis/handling-distribution` | Self vs Outsourced counts |
| GET | `/api/prm/kpis/requested-vs-provided` | Pre-requested vs walk-up vs fulfilled |

### Filter Endpoints (`/api/prm/filters`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prm/filters/options` | Available airlines, services, handlers, flights, date range for an airport |

### Trend Endpoints (`/api/prm/trends`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prm/trends/daily` | Daily service counts + average line |
| GET | `/api/prm/trends/monthly` | Monthly aggregated counts |
| GET | `/api/prm/trends/hourly` | Day-of-week x hour-of-day heatmap matrix |
| GET | `/api/prm/trends/requested-vs-provided` | Daily requested vs provided overlay |

### Ranking Endpoints (`/api/prm/rankings`)

| Method | Endpoint | Params | Description |
|---|---|---|---|
| GET | `/api/prm/rankings/airlines` | `limit` (default 10) | Top airlines by PRM count |
| GET | `/api/prm/rankings/flights` | `limit` (default 10) | Top flights by PRM count |
| GET | `/api/prm/rankings/agents` | `limit` (default 10) | Agent leaderboard with stats |
| GET | `/api/prm/rankings/services` | - | Service types ranked by volume |

### Breakdown Endpoints (`/api/prm/breakdowns`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prm/breakdowns/by-service-type` | PRM count by IATA SSR code |
| GET | `/api/prm/breakdowns/by-agent-type` | PRM count by Self/Outsourced |
| GET | `/api/prm/breakdowns/by-airline` | PRM count by airline |
| GET | `/api/prm/breakdowns/by-location` | PRM count by airport location |
| GET | `/api/prm/breakdowns/by-route` | Top departure-arrival route pairs |
| GET | `/api/prm/breakdowns/agent-service-matrix` | Agent x Service heatmap data |

### Performance Endpoints (`/api/prm/performance`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/prm/performance/duration-distribution` | Duration buckets with p50/p90/avg |
| GET | `/api/prm/performance/duration-stats` | Min/max/avg/median/p90/p95 stats |
| GET | `/api/prm/performance/no-shows` | No-show rates by airline |
| GET | `/api/prm/performance/pause-analysis` | Pause rate, avg pause duration, by service type |
| GET | `/api/prm/performance/duration-by-agent-type` | Avg duration: Self vs Outsourced per service type |

### Record Endpoints (`/api/prm`)

| Method | Endpoint | Params | Description |
|---|---|---|---|
| GET | `/api/prm/records` | `page`, `size`, `sort` | Paginated service records |
| GET | `/api/prm/records/{id}/segments` | `airport` | Time segments for a service (pause/resume detail) |

---

## Quick Start

```bash
git clone https://github.com/cosmo666/prm-dashboard.git
cd prm-dashboard
cp .env.example .env
docker compose up --build
```

Then visit `http://aeroground.localhost:4200` (or use the `X-Tenant-Slug` header in dev) and log in with `admin` / `admin123`.

**Data regeneration** (legacy MySQL → Parquet pipeline, run only when the seed data changes):

```bash
docker compose up mysql -d                                          # 1. Boot MySQL with seed scripts
dotnet run --project backend/tools/PrmDashboard.CsvExporter         # 2. Export tables → CSV
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder      # 3. CSV → per-tenant Parquet under data/
```

Runtime services don't connect to MySQL; they read directly from `data/{slug}/prm_services.parquet` and `data/master/*.parquet` via DuckDB.

## Demo Credentials

All seed users share the password `admin123` (hashed on first login via the `BCRYPT_PENDING:` bootstrap convention).

| Tenant | Users | Airports |
|---|---|---|
| **aeroground** | admin (BLR+HYD+DEL), john (BLR+HYD), priya (BLR), ravi (DEL) | BLR, HYD, DEL |
| **skyserve** | admin (BLR+BOM+MAA), anika (BLR+BOM), deepak (MAA), sunita (BOM) | BLR, BOM, MAA |
| **globalprm** | admin (SYD+KUL+JFK), sarah (SYD+KUL), mike (JFK), li (KUL) | SYD, KUL, JFK |

Each username exists independently per tenant -- scoped by the `X-Tenant-Slug` header.

## Project Structure

```text
prm-dashboard/
+-- backend/
|   +-- PrmDashboard.sln
|   +-- src/
|   |   +-- PrmDashboard.Shared/        # DuckDB abstractions, DTOs, plain data classes, helpers
|   |   +-- PrmDashboard.AuthService/    # Login, refresh, logout, /me; InMemoryRefreshTokenStore
|   |   +-- PrmDashboard.TenantService/  # /config + /airports; TenantsLoader (startup dict)
|   |   +-- PrmDashboard.PrmService/     # 25 analytics endpoints over per-tenant Parquet via DuckDB
|   |   '-- PrmDashboard.Gateway/        # Ocelot routing + subdomain middleware
|   +-- tools/
|   |   +-- PrmDashboard.CsvExporter/    # One-shot: legacy MySQL -> CSV (uses MySqlConnector)
|   |   '-- PrmDashboard.ParquetBuilder/ # One-shot: CSV -> per-tenant Parquet (uses DuckDB)
|   '-- tests/
|       '-- PrmDashboard.Tests/          # 132 tests across all services + integration fixtures
+-- data/                                # Generated by tools/; gitignored
|   +-- master/                          # tenants.parquet, employees.parquet, employee_airports.parquet
|   '-- {tenant-slug}/                   # prm_services.parquet -- one folder per tenant
+-- frontend/                            # Angular 17 SPA
|   '-- src/app/
|       +-- core/                        # Auth, API client, stores (tenant, auth, filter, navigation)
|       +-- features/                    # auth/login, home, dashboard/{5 tabs, components}
|       '-- shared/                      # 6 chart wrappers, top-bar, airport-selector, pipes, directives
+-- database/
|   +-- init/                            # MySQL init + seed scripts (legacy source for the export pipeline)
|   '-- seed/                            # Python PRM data generator (~17k records)
+-- docs/
|   +-- e2e-checklist.md
|   '-- superpowers/
|       +-- specs/                       # Design specs (original POC + Phase 1-3d-2 migration)
|       '-- plans/                       # Implementation plans (original POC + Phase 1-3d-2 migration)
+-- docker-compose.yml
+-- .env.example
'-- README.md
```

## Build & Test

```bash
# Backend
cd backend && dotnet build                             # 0 errors, 0 warnings

# Frontend
cd frontend && npm install && npx ng build             # Production bundle

# Full stack
docker compose up --build
```

Then walk the [E2E checklist](docs/e2e-checklist.md) for manual verification.

## Docs

- [E2E checklist](docs/e2e-checklist.md) -- manual verification scenarios
- [CLAUDE.md](CLAUDE.md) -- project instructions for Claude Code

## Recent Changes

### 2026-04-22 — MySQL/EF → DuckDB/Parquet migration (Phases 1 → 3d-2)

Backend runtime is now EF/MySQL-free. All 25 PrmService analytics endpoints, plus AuthService and TenantService, read directly from per-tenant Parquet files via `DuckDB.NET`. Highlights:

- **Phases 1-2:** Built `tools/PrmDashboard.CsvExporter` (MySQL → CSV) and `tools/PrmDashboard.ParquetBuilder` (CSV → per-tenant Parquet under `data/`).
- **Phase 3a:** Shared `IDuckDbContext` + `TenantParquetPaths` + `DataPathOptions` + `DataPathValidator` + `PooledDuckDbSession` foundation.
- **Phase 3b:** AuthService rewritten — reads `master/employees.parquet`; refresh tokens moved to `InMemoryRefreshTokenStore`.
- **Phase 3c:** TenantService rewritten — `TenantsLoader` (startup dict from `master/tenants.parquet`); `SchemaMigrator` deleted.
- **Phase 3d-1:** PrmService — all 25 endpoints over DuckDB SQL; `BaseQueryService` central filter builder; `HhmmSql` time helpers; 43 new tests.
- **Phase 3d-2:** Cleanup — `/api/tenants/resolve/{slug}` deleted; `Tenant.cs`, `RefreshToken.cs`, `PrmServiceRecord.cs` removed; EF/Pomelo packages dropped from `Shared.csproj`.
- **Hardening:** `TenantSlugClaimCheckMiddleware` now requires `X-Tenant-Slug` presence (not just match); `TenantParquetNotFoundException` → 404 mapping.

Migration design: `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`. Per-phase plans under `docs/superpowers/plans/`.

### 2026-04-13 — Dashboard UI polish

- **Chart axis labels + units** — `app-bar-chart` and `app-horizontal-bar-chart` now render axis titles from `xLabel`/`yLabel` inputs and format tick/tooltip values via a new `unit` input (e.g. `unit="services"`, `unit="%"`, `unit="min"`). Numbers are thousand-separated; ticks stay compact while tooltips show the full unit. Applied across Top 10 and Overview bar charts.
- **Agents leaderboard ("Top 10 Agents" table)** —
  - `Avg/Day` renamed to **Avg PRM/Day** for clarity.
  - `Service` column replaced by **Most Serviced**, which now shows *top-service count / total PRM count* alongside the service chip (e.g. `245 / 300 WCHR` = 245 of this agent's 300 services were WCHR).
  - Backend `AgentRankingItem` DTO gained `TopServiceCount` and `AvgPerDay` fields; `FlightRankingItem` was added with `ServicedCount` / `RequestedCount` so the Top 10 Flights chart can overlay requested vs serviced. Requires a rebuild of the PRM service (`docker compose up -d --build prm`).

## License

POC -- not licensed for production use.
