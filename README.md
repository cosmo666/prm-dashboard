# PRM Dashboard

Multi-tenant analytics POC for **Passenger with Reduced Mobility (PRM)** ground handling services. Airports and ground-handling companies use this to monitor wheelchair assists, medical-assist services, and other accessibility operations across their locations.

> **Status:** POC feature-complete. All 9 phases / 21 tasks implemented. See [docs/e2e-checklist.md](docs/e2e-checklist.md) for verification steps.

## What it does

- **Multi-tenant** — each ground handler (AeroGround, SkyServe, GlobalPRM, …) has its own isolated database, accessed via tenant subdomain (e.g., `aeroground.prm-app.com`)
- **Runtime tenant onboarding** — attach a new MySQL database on any host, insert one row in `prm_master.tenants`, and the schema auto-bootstraps on first request. No code changes, no restarts
- **Airport-level RBAC** — employees only see data for airports they're assigned to (enforced by JWT claim + server-side middleware)
- **4-tab dashboard** — Overview, Top 10, Service Breakup, Fulfillment — with ~17 interactive ECharts visualizations, cross-filtering, drill-down, and 16 date-range presets

## Architecture

```
Browser (Angular 17)
  ↓ HTTPS
API Gateway (Ocelot, port 5000)
  ├─ /api/auth/**    → Auth Service      (port 5001)
  ├─ /api/tenants/** → Tenant Service    (port 5002)
  └─ /api/prm/**     → PRM Service       (port 5003)
                            ↓
                  ┌─────────┴──────────┐
                  │  Master MySQL DB   │   tenants, employees, airports, refresh_tokens
                  │  Tenant 1 DB       │   prm_services  (can live on a different instance)
                  │  Tenant 2 DB       │   prm_services
                  │  Tenant 3 DB       │   prm_services
                  └────────────────────┘
```

Each tenant DB can live on a completely separate MySQL instance. The `Tenant.GetConnectionString()` method and the `SchemaMigrator` in TenantService support arbitrary `db_host`/`db_port`/`db_name`/`db_user`/`db_password` per tenant.

## Tech stack

**Backend** — .NET 8, ASP.NET Core Web API, EF Core 8 (Pomelo MySQL provider), MySqlConnector, BCrypt.Net, System.IdentityModel.Tokens.Jwt, Ocelot API Gateway

**Frontend** — Angular 17 (standalone components), Angular Material 3, ngx-echarts, NgRx Signal Store, TypeScript, SCSS

**Database** — MySQL 8.0 (per-tenant isolation)

**Infrastructure** — Docker Compose for local development, cloud-ready containers

## Quick start

```bash
git clone https://github.com/cosmo666/prm-dashboard.git
cd prm-dashboard
cp .env.example .env
docker compose up --build
```

Then visit `http://aeroground.localhost:4200` (or use the `X-Tenant-Slug` header in dev) and log in with `admin` / `admin123`.

## Demo credentials

All seed users share the password `admin123` (hashed on first login via the `BCRYPT_PENDING:` bootstrap convention).

| Tenant | Users | Airports |
|---|---|---|
| **aeroground** | admin (BLR+HYD+DEL), john (BLR+HYD), priya (BLR), ravi (DEL) | BLR, HYD, DEL |
| **skyserve** | admin (BLR+BOM+MAA), anika (BLR+BOM), deepak (MAA), sunita (BOM) | BLR, BOM, MAA |
| **globalprm** | admin (SYD+KUL+JFK), sarah (SYD+KUL), mike (JFK), li (KUL) | SYD, KUL, JFK |

Each username exists independently per tenant — scoped by the `X-Tenant-Slug` header.

## Project structure

```
prm-dashboard/
├── backend/
│   ├── PrmDashboard.sln
│   └── src/
│       ├── PrmDashboard.Shared/        # Entity models, DTOs, time helpers
│       ├── PrmDashboard.AuthService/    # Login, refresh, logout, /me
│       ├── PrmDashboard.TenantService/  # Tenant resolution + SchemaMigrator
│       ├── PrmDashboard.PrmService/     # 23 analytics endpoints
│       └── PrmDashboard.Gateway/        # Ocelot routing + subdomain middleware
├── frontend/                            # Angular 17 SPA — login, home, 4 dashboard tabs
│   └── src/app/
│       ├── core/                        # auth, api client, stores (tenant, auth, filter)
│       ├── features/                    # auth/login, home, dashboard/{tabs, components}
│       └── shared/                      # 6 chart wrappers, top-bar, airport-selector
├── database/
│   ├── init/                            # MySQL init + seed scripts (run on container boot)
│   └── seed/                            # Python PRM data generator
├── docs/
│   ├── e2e-checklist.md                 # E2E verification checklist
│   └── superpowers/
│       ├── specs/                       # Design specs
│       └── plans/                       # Implementation plan (21 tasks / 9 phases)
├── docker-compose.yml
├── .env.example
└── README.md
```

## Adding a new tenant

Onboarding a new tenant at runtime:

1. Create an empty MySQL database on any reachable host
2. `INSERT INTO prm_master.tenants (name, slug, db_host, db_port, db_name, db_user, db_password, is_active, primary_color) VALUES (...)`
3. `INSERT` employees + `employee_airports` rows for that tenant
4. Point `{slug}.your-domain.com` DNS at the Angular app (or set `X-Tenant-Slug` header in dev)
5. First request auto-bootstraps the tenant DB schema via the embedded `SchemaMigrator`

No deploys, no manual DDL, no downtime.

## Build & test

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

- [Design spec](docs/superpowers/specs/2026-04-08-prm-dashboard-design.md) — full data model, API design, frontend architecture
- [Implementation plan](docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md) — 21 tasks across 9 phases
- [E2E checklist](docs/e2e-checklist.md) — manual verification scenarios
- [CLAUDE.md](CLAUDE.md) — project instructions for Claude Code

## License

POC — not licensed for production use.
