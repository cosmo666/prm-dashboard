# Session Log

<!-- Claude: After completing substantive work, add a brief dated summary. Keep this file under 50 lines. Trim entries older than 2 weeks. -->

## Recent Sessions

- 2026-04-08: **Phases 2-4 complete.** Phase 2 (Auth Service): login/refresh/logout/me with BCrypt hashing, HS256 JWT, atomic refresh rotation, BCRYPT_PENDING bootstrap. Phase 3 (Tenant Service): tenant resolution, SchemaMigrator with embedded versioned migrations, 5-min connection cache, semaphore-guarded migration runner. Phase 4 (PRM Service): 23 endpoints across 7 controllers (KPIs, filters, trends, rankings, breakdowns, performance, records), airport RBAC middleware, TenantDbContextFactory for per-tenant DB access, PrmControllerBase, global exception handler. Review fixes: pinned MySqlServerVersion, fail-fast JWT config, atomic refresh CAS, negative duration guard, base controller extraction.

- 2026-04-08: **PRM Dashboard POC kickoff.** Wrote design spec (11 sections) and 21-task implementation plan (6,204 lines) covering .NET 8 microservices + Angular 17 + MySQL multi-tenant POC. Created GitHub repo `cosmo666/prm-dashboard`. Started subagent-driven execution.

- 2026-04-08: **Phase 1 complete.** Task 1: docker-compose + MySQL init scripts (master + 3 tenant DBs, prm_services table via stored procedure). Task 2: .NET 8 solution + PrmDashboard.Shared library (5 EF entities, 9 DTO files, TimeHelpers). Applied review fixes: authenticated MySQL healthcheck (prevents init-race), tenant env var cleanup, id column documentation, legacy .sln format for Dockerfile compatibility. All spec-compliant.

- 2026-04-08: **Multi-tenant design enhancement.** User raised runtime-tenant-onboarding requirement. Audited design and extended Task 5 plan with `SchemaMigrator` — embedded versioned SQL migrations (`backend/src/PrmDashboard.TenantService/Schema/Migrations/NNN_*.sql`) + `schema_migrations` tracker table per tenant. Result: attach a new MySQL DB on any host, INSERT one row in `prm_master.tenants`, schema auto-bootstraps on first request. No code changes, no restarts, no manual DDL. Schema evolution is fire-and-forget (never edit a committed migration; always add a new one).

- 2026-04-08: **Docs and .claude sync.** Created README.md + CLAUDE.md. Expanded .gitignore for full .NET + Angular + Docker tree. Replaced stale `rms-domain` skill with `prm-domain` (PRM domain knowledge: IATA SSR codes, HHMM time encoding, pause/resume dedup, query patterns). Deleted `python-backend.md` and `react-frontend.md`; created `dotnet-backend.md` and `angular-frontend.md`. Rewrote `architecture.md` for PRM. Appended PRM decisions to `memory-decisions.md`.
