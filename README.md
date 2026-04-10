# PRM Dashboard

Multi-tenant analytics POC for **Passenger with Reduced Mobility (PRM)** ground handling services. Airports and ground-handling companies use this to monitor wheelchair assists, medical-assist services, and other accessibility operations across their locations.

> **Status:** POC feature-complete. All 9 phases / 21 tasks implemented. See [docs/e2e-checklist.md](docs/e2e-checklist.md) for verification steps.

## What it does

- **Multi-tenant** — each ground handler (AeroGround, SkyServe, GlobalPRM, ...) has its own isolated database, accessed via tenant subdomain (e.g., `aeroground.prm-app.com`)
- **Runtime tenant onboarding** — attach a new MySQL database on any host, insert one row in `prm_master.tenants`, and the schema auto-bootstraps on first request. No code changes, no restarts
- **Airport-level RBAC** — employees only see data for airports they're assigned to (enforced by JWT claim + server-side middleware)
- **5-tab dashboard** — Overview, Top 10, Service Breakup, Fulfillment, Insights — with ~17 interactive ECharts visualizations, cross-filtering, drill-down, and 16 date-range presets

---

## Architecture

```
Browser (Angular 17 SPA)
  | HTTPS
API Gateway (Ocelot, port 5000)
  |-- /api/auth/**    --> Auth Service      (port 5001)
  |-- /api/tenants/** --> Tenant Service    (port 5002)
  '-- /api/prm/**     --> PRM Service       (port 5003)
                             |
                   +---------+-----------+
                   |  Master MySQL DB    |   tenants, employees, employee_airports, refresh_tokens
                   |  Tenant 1 DB        |   prm_services (can live on a different instance)
                   |  Tenant 2 DB        |   prm_services
                   |  Tenant 3 DB        |   prm_services
                   +---------------------+
```

Each tenant DB can live on a completely separate MySQL instance. The `Tenant.GetConnectionString()` method and the `SchemaMigrator` in TenantService support arbitrary `db_host`/`db_port`/`db_name`/`db_user`/`db_password` per tenant.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Backend runtime** | .NET | 8.0 |
| **Backend framework** | ASP.NET Core Web API | 8.0 |
| **ORM** | Entity Framework Core (Pomelo MySQL) | 8.0.2 |
| **Raw SQL driver** | MySqlConnector | 2.3.7 |
| **Auth - password hashing** | BCrypt.Net-Next | 4.0.3 |
| **Auth - JWT** | System.IdentityModel.Tokens.Jwt | 7.6.2 |
| **API Gateway** | Ocelot | 23.2.0 |
| **Frontend framework** | Angular (standalone components) | 17+ |
| **UI library** | Angular Material 3 | 17.3 |
| **Charts** | Apache ECharts via ngx-echarts | - |
| **Frontend state** | NgRx Signal Store (@ngrx/signals) | - |
| **Language** | TypeScript (strict mode) | 5.x |
| **Styling** | SCSS with CSS custom properties | - |
| **Database** | MySQL | 8.0 |
| **Container orchestration** | Docker Compose | - |

---

## Multi-Tenant Flow

### How tenant isolation works

```
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
4. Auth Service resolves tenant via TenantService
   --> looks up employees WHERE tenant_id = resolved tenant
   --> validates password via BCrypt
   --> issues JWT with claims: sub, tenant_id, tenant_slug, name, airports[]
   --> sets httpOnly refresh cookie (7-day, Secure, SameSite=Strict)
                      |
5. Subsequent API calls flow through Ocelot Gateway:
   Gateway middleware extracts subdomain from Host header
   --> sets X-Tenant-Slug request header
   --> forwards to downstream service
                      |
6. PRM Service receives request:
   --> reads X-Tenant-Slug header
   --> calls TenantService.ResolveAsync(slug) to get connection string
   --> SchemaMigrator.RunAsync() runs on cache miss (auto-applies migrations)
   --> connection cached for 5 minutes
   --> validates airport RBAC: ?airport=X must be in JWT airports claim
   --> queries tenant-specific database
   --> returns data scoped to that tenant only
```

### Tenant resolution chain

```
Subdomain --> slug --> prm_master.tenants row --> decrypted connection string --> tenant DB
```

- **No cross-tenant data leakage** — each request resolves to exactly one tenant DB
- **Connection caching** — resolved connections are cached in-memory for 5 min (not shared across replicas)
- **Schema migration** — on cache miss, `SchemaMigrator` applies any pending SQL migrations from `TenantService/Schema/Migrations/` before returning the connection
- **RBAC enforcement** — PRM Service middleware validates `?airport=X` against the JWT `airports` claim; returns 403 on mismatch

### Onboarding a new tenant (zero downtime)

```sql
-- 1. Create empty database on any reachable MySQL instance
CREATE DATABASE newclient_db;

-- 2. Register tenant in master DB
INSERT INTO prm_master.tenants
  (name, slug, db_host, db_port, db_name, db_user, db_password, is_active, primary_color)
VALUES
  ('New Client', 'newclient', 'mysql-host-2', 3306, 'newclient_db', 'app_user', 'encrypted_pwd', TRUE, '#2563eb');

-- 3. Add employees and airport assignments
INSERT INTO prm_master.employees (tenant_id, username, password_hash, display_name)
VALUES (LAST_INSERT_ID(), 'admin', 'BCRYPT_PENDING:admin123', 'Admin NewClient');

INSERT INTO prm_master.employee_airports (employee_id, airport_code, airport_name)
VALUES (LAST_INSERT_ID(), 'LHR', 'Heathrow Airport');
```

Then point `newclient.prm-app.com` DNS at the Angular app. The first request auto-bootstraps the tenant DB schema via the embedded `SchemaMigrator`.

No deploys, no manual DDL, no downtime.

---

## Database Schema

### Master Database (`prm_master`)

#### `tenants`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `name` | VARCHAR(100) | NOT NULL |
| `slug` | VARCHAR(50) | NOT NULL, UNIQUE |
| `db_host` | VARCHAR(255) | NOT NULL, DEFAULT 'mysql' |
| `db_port` | INT | NOT NULL, DEFAULT 3306 |
| `db_name` | VARCHAR(100) | NOT NULL |
| `db_user` | VARCHAR(100) | NOT NULL, DEFAULT 'root' |
| `db_password` | VARCHAR(255) | NOT NULL |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `logo_url` | VARCHAR(500) | NULL |
| `primary_color` | VARCHAR(7) | NOT NULL, DEFAULT '#2563eb' |

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

#### `refresh_tokens`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT |
| `employee_id` | INT | NOT NULL, FK -> employees(id) CASCADE |
| `token` | VARCHAR(500) | NOT NULL, UNIQUE |
| `expires_at` | DATETIME | NOT NULL |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `revoked` | BOOLEAN | NOT NULL, DEFAULT FALSE |

Index: `(employee_id, revoked, expires_at)`

### Tenant Databases (`aeroground_db`, `skyserve_db`, `globalprm_db`)

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

Indexes: `(loc_name, service_date)`, `(service_date, loc_name, airline)`, `(id)`, `(airline)`, `(service)`, `(agent_no)`, `(prm_agent_type)`

**Dedup pattern:** `COUNT(DISTINCT id)` — pause/resume creates multiple rows with the same `id`; each service counts once. Duration = sum of active segments per `id`.

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
| GET | `/api/tenants/config?slug=X` | No | Tenant branding (name, logo, color) |
| GET | `/api/tenants/resolve/{slug}` | Yes | Internal: returns tenant connection info |
| GET | `/api/tenants/airports` | Yes | Airports assigned to authenticated employee |

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
|   '-- src/
|       +-- PrmDashboard.Shared/        # Entity models, DTOs, time helpers
|       +-- PrmDashboard.AuthService/    # Login, refresh, logout, /me
|       +-- PrmDashboard.TenantService/  # Tenant resolution + SchemaMigrator
|       +-- PrmDashboard.PrmService/     # 23 analytics endpoints (6 controllers)
|       '-- PrmDashboard.Gateway/        # Ocelot routing + subdomain middleware
+-- frontend/                            # Angular 17 SPA
|   '-- src/app/
|       +-- core/                        # Auth, API client, stores (tenant, auth, filter, navigation)
|       +-- features/                    # auth/login, home, dashboard/{5 tabs, components}
|       '-- shared/                      # 6 chart wrappers, top-bar, airport-selector, pipes, directives
+-- database/
|   +-- init/                            # MySQL init + seed scripts (run on container boot)
|   '-- seed/                            # Python PRM data generator (~17k records)
+-- docs/
|   +-- e2e-checklist.md
|   '-- superpowers/
|       +-- specs/                       # Design specs
|       '-- plans/                       # Implementation plan (21 tasks / 9 phases)
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

- [Design spec](docs/superpowers/specs/2026-04-08-prm-dashboard-design.md) -- full data model, API design, frontend architecture
- [Implementation plan](docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md) -- 21 tasks across 9 phases
- [E2E checklist](docs/e2e-checklist.md) -- manual verification scenarios
- [CLAUDE.md](CLAUDE.md) -- project instructions for Claude Code

## License

POC -- not licensed for production use.
