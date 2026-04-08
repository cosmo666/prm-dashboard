# Technical Decisions Log

<!-- Claude: Add dated entries when architectural or technical decisions are made. Format: YYYY-MM-DD. -->

## PRM Dashboard POC (this project)

### 2026-04-08 — Project kickoff and stack
- Backend: .NET 8 + ASP.NET Core Web API + EF Core 8 (Pomelo MySQL provider) + MySqlConnector for raw SQL + BCrypt.Net-Next + JWT + Ocelot API Gateway
- Frontend: Angular 17 (standalone components, no NgModules) + Angular Material 3 + Apache ECharts via ngx-echarts + NgRx Signal Store + TypeScript strict mode
- Database: MySQL 8.0 (per-tenant isolation — each tenant has its own database, optionally on a different MySQL instance)
- Container orchestration: Docker Compose for local dev

### 2026-04-08 — Multi-tenancy architecture
- **Tenant isolation strategy:** master DB (`prm_master`) holds tenants + employees + employee_airports + refresh_tokens; each tenant has its own isolated database containing only `prm_services` and `schema_migrations`
- **Tenant DB hosts can differ** — `tenants.db_host` is per-row, so one tenant can run on a separate MySQL instance from another
- **Tenant resolution** — subdomain (e.g., `aeroground.prm-app.com`) → slug → Gateway adds `X-Tenant-Slug` header → TenantService looks up by slug → decrypts password → returns connection string
- **Runtime tenant onboarding** — attach a new DB, insert a row in `prm_master.tenants`, the first request triggers `SchemaMigrator.RunAsync()` which creates all tables from embedded SQL migration files. No code changes, no restarts, no manual DDL
- **Credential storage** — tenant DB passwords stored AES-256 encrypted at rest in the master DB, decrypted in-memory by TenantService
- **Connection caching** — TenantService caches decrypted tenant connections in-memory for 5 minutes keyed on slug

### 2026-04-08 — Schema evolution strategy
- **Versioned migrations over manual ALTER.** Migration files live in `backend/src/PrmDashboard.TenantService/Schema/Migrations/` as embedded resources (e.g., `001_create_prm_services.sql`, `002_add_cost_center.sql`)
- **`schema_migrations` tracker table** lives in each tenant DB. Auto-created by `SchemaMigrator` on first run
- **Applied migrations are immutable.** NEVER edit a committed migration file — always add a new one. Editing is a data-integrity violation because tenant DBs already have the old version applied
- **Migrations run in lexicographic order** by filename. Zero-padded 3-digit prefix (`001`, `002`, ...) enforces the order
- **Transactional per migration** — if the DDL fails, the transaction rolls back and the tracker row is not inserted, so the next request retries
- **Ordering guarantee** — a semaphore guards `SchemaMigrator.RunAsync()` to prevent two concurrent first-hit requests for the same tenant from racing

### 2026-04-08 — Authentication
- **Access token** — JWT signed HS256 with secret from config, 15-minute lifetime, stored in-memory only (never localStorage) to resist XSS
- **Refresh token** — random 500-char token stored hashed in `refresh_tokens` table, delivered to client as httpOnly + Secure + SameSite=Strict cookie, 7-day lifetime. Resists XSS and CSRF
- **JWT claims:** `sub` (employee id), `tenant_id`, `tenant_slug`, `name`, `airports` (list of IATA codes)
- **Password hashing:** BCrypt.Net-Next with default work factor 11
- **Auto-refresh on 401:** Angular `AuthInterceptor` detects 401, calls `/auth/refresh` with the cookie, retries the original request with the new token. Transparent to feature code
- **Logout** — revokes the refresh token server-side (sets `revoked = TRUE`) and clears the access token client-side

### 2026-04-08 — RBAC
- **Airport-level access control, not role-based.** Each employee has an explicit list of airports in `employee_airports` (copied into the JWT `airports` claim at login)
- **Server-side enforcement** — PRM Service middleware validates `?airport=X` against the JWT claim on every request, 403 on mismatch
- **Client-side filtering** — `AirportSelectorComponent` only shows airports from `AuthStore.employee()!.airports`, disabled dropdown if the user has only one airport
- **No role column in employees table** — the POC doesn't distinguish between managers/admins/agents. All authenticated users see the dashboards for their allowed airports

### 2026-04-08 — Dedup and duration calculations
- **Pause/resume pattern** — when a PRM service is paused and resumed, the source system writes multiple rows with the same `prm_services.id`. Aggregations must use `COUNT(DISTINCT id)` to count services, not `COUNT(*)`
- **Duration = sum of active segments per id.** Handled in SQL with `GROUP BY id` and case-when for paused vs completed rows. `TimeHelpers.CalculateActiveMinutes()` handles the single-row case; multi-row summation is SQL-side
- **Time encoding** — `start_time`, `paused_at`, `end_time` are INT columns storing HHMM (e.g., `237` = 02:37, `1430` = 14:30). NOT minutes-since-midnight. Conversion: `(hhmm / 100) * 60 + (hhmm % 100)`
- **Midnight crossing** — POC assumes services do not cross midnight. If real data later includes midnight-crossing services, add explicit handling in the SQL aggregation layer

### 2026-04-08 — Docker Compose setup
- **MySQL init scripts** via `/docker-entrypoint-initdb.d` volume mount. `01-master-schema.sql` and `02-tenant-schema.sql` run once at first container boot. Later seeds (03-05) added in Phase 6
- **Authenticated healthcheck** — `mysqladmin ping -u root -p$MYSQL_ROOT_PASSWORD` with `start_period: 30s` and 10 retries. Anonymous ping can falsely report healthy before init scripts complete on MySQL 8
- **depends_on: service_healthy** — auth/tenant/prm services wait for MySQL to be healthy. Gateway uses `service_started` for the backend services (no healthchecks yet — TODO in later phase)
- **.NET services on port 8080 internally, exposed via host ports** per `.env` (gateway 5000, auth 5001, tenant 5002, prm 5003)
- **Legacy `.sln` solution format** instead of .NET 10's new `.slnx` — Dockerfile `COPY` patterns expect the classic extension

### 2026-04-08 — Frontend state management
- **NgRx Signal Store for shared state** (auth, tenant, filter). Component signals for local state
- **Filter state synced to URL query params** — reloads and shared URLs preserve the user's selections
- **No `localStorage` for tokens** — access token in memory only, refresh in httpOnly cookie
- **All API calls via `ApiClient` wrapper** — feature code never injects `HttpClient` directly
- **All charts wrap `BaseChartComponent`** — guarantees consistent loading skeleton, empty state, and card layout

### 2026-04-08 — Review process
- Adopted subagent-driven development with two-stage review (spec compliance → code quality) for plan execution. Review checkpoints after each phase, user approval required before proceeding

---

## Legacy entries (pre-project, kept for historical context)

### 2026-03-18
- Project scaffolding created — .claude config, rules, agents, skills set up before stack decision
- Memory layer uses split files in .claude/rules/ — profile, preferences, decisions, sessions, private
