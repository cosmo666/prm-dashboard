# MySQL → DuckDB/Parquet Migration — Design Spec

**Date:** 2026-04-20
**Status:** Approved (sections 1 + 2)
**Scope:** Replace MySQL with a file-based data layer (CSV source of truth → Parquet compiled format → DuckDB query engine) while keeping the 4 .NET microservices, their endpoint contracts, and the Angular dashboard unchanged.

## Goals

1. Remove MySQL from the stack entirely (container, EF Core, Pomelo, MySqlConnector).
2. Ground the system on a `data/` folder of CSV + Parquet files — per-tenant folders, one folder for master data.
3. DuckDB becomes the only query engine, embedded in the backend services via `DuckDB.NET.Data`.
4. Frontend unchanged — same endpoints, same DTOs, same UX.
5. Auth refresh-token writes eliminated: in-memory `ConcurrentDictionary` replaces the `refresh_tokens` table.

## Non-goals

- Scaling beyond a single backend instance (in-memory auth state is incompatible with multiple replicas — explicitly accepted for POC).
- Write-back to Parquet from the running app. The backend is read-only over Parquet. Data updates happen offline via the CSV-editing + re-build flow.
- Production-grade revocation. No "admin logs out user X" capability in the POC.

## Target architecture

```
Angular dashboard (UNCHANGED)
        │ HTTPS — same endpoint contracts
.NET 8 API (Auth, Tenant, PRM, Gateway — same services, same DTOs)
        │ DuckDB.NET.Data — embedded, reads Parquet
data/
  master/
    tenants.csv + .parquet
    employees.csv + .parquet
    employee_airports.csv + .parquet
  airasia/  prm_services.csv + .parquet
  indigo/   prm_services.csv + .parquet
  vistara/  prm_services.csv + .parquet
```

### Decisions

| Decision | Value | Why |
|---|---|---|
| Export scope | Full fidelity (tenants, employees, employee_airports, prm_services per tenant) | Needed for cross-table joins in DuckDB later (e.g., employee names on PRM records). Refresh tokens and schema_migrations excluded — obsolete in new model. |
| Folder layout | Flat per-tenant folders: `data/master/`, `data/{slug}/` | Matches mental model (one folder per logical DB). Clean DuckDB paths: `FROM 'data/airasia/prm_services.parquet'`. Overwrite-in-place for POC. |
| Export tooling | .NET console app in same solution | Reuses `PrmDashboard.Shared` entity models + existing tenant connection string logic. No duplicated auth/decryption code. |
| CSV → Parquet conversion | .NET console app using DuckDB's built-in `COPY … TO … (FORMAT 'parquet')` | Deterministic, reproducible. Parquet is the query format; CSV is the human-readable source of truth. |
| Refresh token storage | In-memory `ConcurrentDictionary` in AuthService | No "write problem" against Parquet. Accept: restarts invalidate sessions, doesn't scale to multiple replicas. POC-grade. |
| Employee auth lookup | Read `master/employees.parquet` via DuckDB on each login | Read-only. BCrypt hash comparison unchanged. |
| Tenant resolution | Read `master/tenants.parquet` on startup + 5-min cache (same as today) | `connection_string` column is obsolete — replaced with implicit mapping: `slug` → `data/{slug}/` folder. |
| Schema evolution | No migration framework — Parquet schema is the schema | When a column is added, rebuild Parquet from updated CSV. `SchemaMigrator` + embedded .sql files deleted. |

## Migration phases

The project proceeds in four isolated phases. Each phase is reversible: after any phase, the prior stack still works against MySQL, and we can verify before moving on.

### Phase 1 — MySQL → CSV exporter (one-shot, reversible)

**Deliverable:** `backend/tools/PrmDashboard.CsvExporter/` — new .NET 8 console project.

**Behavior:**
- Reads master MySQL connection string from `appsettings.json` (or `--master` CLI arg).
- Dumps `master.tenants`, `master.employees`, `master.employee_airports` to `data/master/*.csv`.
- Iterates active tenants, uses each tenant's connection string to dump `prm_services` → `data/{slug}/prm_services.csv`.
- Skips `refresh_tokens` and `schema_migrations` (obsolete in new model).
- Invocation: `dotnet run --project backend/tools/PrmDashboard.CsvExporter -- --out ./data`
- Safe to re-run: overwrites CSVs in place. MySQL is read-only from the tool's perspective.

**CSV formatting defaults** (to be confirmed in plan):
- UTF-8, no BOM.
- Unix line endings (LF).
- Quoted when the field contains a comma, quote, or newline (RFC 4180).
- `DateOnly` as `yyyy-MM-dd`, `DateTime` as ISO-8601 UTC (`yyyy-MM-ddTHH:mm:ssZ`).
- HHMM integer columns stay as integers (no zero-padding to string).
- Booleans as `true` / `false`.
- Nulls as empty cells (not the literal word "null").

**Verification:** row counts in each CSV match `SELECT COUNT(*)` from the source table.

### Phase 2 — CSV → Parquet builder (one-shot, deterministic)

**Deliverable:** `backend/tools/PrmDashboard.ParquetBuilder/` — new .NET 8 console project using `DuckDB.NET.Data`.

**Behavior:**
- Walks `data/` recursively. For each `*.csv`, runs `COPY (SELECT * FROM read_csv_auto('file.csv')) TO 'file.parquet' (FORMAT 'parquet')`.
- Invocation: `dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data`
- Safe to re-run, overwrites Parquet files.

### Phase 3 — Backend swap (the actual work)

**In each of AuthService / TenantService / PrmService:**
- Remove NuGet: `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, `MySqlConnector`.
- Add NuGet: `DuckDB.NET.Data`.
- Replace `DbContext` classes with a thin `DuckDbContext` helper that opens a DuckDB connection scoped to the request, pointed at `data/`.
- Rewrite the 19 PRM analytics endpoints: EF LINQ → raw SQL over DuckDB. Most queries port verbatim; MySQL-specific functions (`DATE_FORMAT`, `GROUP_CONCAT`) become DuckDB equivalents (`strftime`, `STRING_AGG`). Specific translation checklist to be produced as part of the phase 3 plan (out of scope for this spec).
- Rewrite `AuthService.LoginAsync` to look up employee + BCrypt hash via DuckDB; issue refresh tokens into a `ConcurrentDictionary<string, RefreshTokenEntry>` singleton.
- Delete: `SchemaMigrator`, `Schema/Migrations/*.sql`, the embedded-resource csproj entries.

### Phase 4 — Decommission MySQL

- Remove `mysql:` service from `docker-compose.yml`.
- Remove `database/init/*.sql`.
- Remove MySQL connection strings from `appsettings.json`.
- Mount `data/` as a volume in each backend service in `docker-compose.yml`.
- Update `.env.example` to drop MySQL credentials.

## Files that go away

- `database/init/01-master-schema.sql`, `02-tenant-schema.sql`, `03-seed-tenants.sql`, `04-seed-employees.sql`, `05-seed-prm-data.sql`
- `backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`
- `backend/src/PrmDashboard.TenantService/Schema/Migrations/*.sql`
- `Tenant.DbHost`, `Tenant.DbPort`, `Tenant.DbName`, `Tenant.DbUser`, `Tenant.DbPassword` fields (subsumed by `slug` → folder mapping)
- `RefreshToken` entity (replaced by in-memory record)

## Files that get added

- `backend/tools/PrmDashboard.CsvExporter/` — phase 1 tool
- `backend/tools/PrmDashboard.ParquetBuilder/` — phase 2 tool
- `backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs` — thin helper, replaces `DbContext`
- `data/` folder (gitignored by default; CSV can be committed if the POC wants fixture data in git — decided in phase 1 plan)

## Open items (to resolve during implementation planning)

1. Exact SQL translation checklist for the 19 PRM endpoints (phase 3).
2. Whether `data/` is gitignored or committed (phase 1).
3. Whether the existing NuGet tenant connection caching (`IMemoryCache`) stays or gets simplified since there are no more remote DB connections (phase 3).
4. Whether `PrmDashboard.Shared/Models/Tenant.cs` drops the DB-connection fields immediately (phase 3) or in a later cleanup PR.

## Success criteria

- Phase 1: `data/master/*.csv` and `data/{slug}/prm_services.csv` exist with row counts matching MySQL. MySQL untouched.
- Phase 2: `data/**/*.parquet` exist; `duckdb -c "SELECT COUNT(*) FROM 'data/airasia/prm_services.parquet'"` returns the same count as the CSV.
- Phase 3: all 19 PRM endpoints return byte-identical JSON (modulo floating-point rounding) as the MySQL-backed version, verified against the E2E checklist in `docs/e2e-checklist.md`.
- Phase 4: `docker compose up` brings up 5 services (no MySQL), the Angular dashboard logs in and renders all 4 tabs with the same data as before.
