# PRM Dashboard

Multi-tenant analytics POC for **Passenger with Reduced Mobility (PRM)** ground handling services. Airports and ground-handling companies use this to monitor wheelchair assists, medical-assist services, and other accessibility operations across their locations.

> **Status:** Work-in-progress POC. Phase 1/9 complete (infrastructure + shared library). Tracking via [docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md](docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md).

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

## Quick start (once Phase 1–6 complete)

```bash
git clone https://github.com/cosmo666/prm-dashboard.git
cd prm-dashboard
cp .env.example .env
docker compose up --build
```

Then visit `http://aeroground.localhost:4200` and log in with `admin` / `admin123`.

## Demo credentials

Each of the 3 seed tenants (`aeroground`, `skyserve`, `globalprm`) has the same 4 demo users:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | All airports for the tenant |
| `john`  | `john123`  | 2 airports |
| `jane`  | `jane123`  | 1 airport |
| `bob`   | `bob123`   | 1 (different) airport |

Scoped by tenant via the subdomain — the same username exists independently in each tenant.

## Project structure

```
prm-dashboard/
├── backend/
│   ├── PrmDashboard.sln
│   └── src/
│       ├── PrmDashboard.Shared/        # Entity models, DTOs, time helpers
│       ├── PrmDashboard.AuthService/    # Login, refresh, logout, /me  (Phase 2)
│       ├── PrmDashboard.TenantService/  # Tenant resolution + schema migrator (Phase 3)
│       ├── PrmDashboard.PrmService/     # 19 analytics endpoints (Phase 4)
│       └── PrmDashboard.Gateway/        # Ocelot routing + subdomain middleware (Phase 5)
├── frontend/                            # Angular 17 SPA (Phases 7-8)
├── database/
│   └── init/                            # MySQL init scripts (schemas + seed data)
├── docs/
│   └── superpowers/
│       ├── specs/                       # Design specs
│       └── plans/                       # Implementation plans (executed task-by-task)
├── docker-compose.yml
├── .env.example
└── README.md                            # (this file)
```

## Adding a new tenant

Once Phase 3 is complete, onboarding a new tenant is:

1. Create an empty MySQL database on any reachable host
2. `INSERT INTO prm_master.tenants (name, slug, db_host, db_port, db_name, db_user, db_password, is_active, primary_color) VALUES (...)` — password pre-encrypted, or use the `PLAINTEXT:` bootstrap prefix
3. `INSERT` employees + `employee_airports` rows for that tenant
4. Point `{slug}.prm-app.com` DNS at the Angular app
5. First request auto-bootstraps the tenant DB schema via the embedded migration runner

No deploys, no manual DDL, no downtime.

## Docs

- [Design spec](docs/superpowers/specs/2026-04-08-prm-dashboard-design.md) — full data model, API design, frontend architecture
- [Implementation plan](docs/superpowers/plans/2026-04-08-prm-dashboard-plan.md) — 21 tasks across 9 phases with bite-sized TDD steps

## License

POC — not licensed for production use.
