# Phase 3d-2 — Final EF/MySQL Cleanup — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Scope:** Delete all EF/MySQL residue from the runtime backend now that PrmService (Phase 3d-1) has zero callers of TenantService's `/resolve/{slug}` endpoint. Removes the endpoint itself, its DTO, vestigial `Shared/Models` entity fields and classes, EF nav properties, and the last two EF-related package references in `Shared.csproj`. Also applies three forward concerns from the Phase 3d-1 final review. After this phase, the entire backend runtime (AuthService, TenantService, PrmService, Shared) contains zero EF Core / Pomelo / MySqlConnector code in source, and Shared's only remaining purpose is DuckDB abstractions + DTOs + pure helpers.

## Goals

1. Delete `/resolve/{slug}` from `TenantController` and the corresponding `ResolveAsync` + `LegacyTenantResolveData` from `TenantResolutionService`.
2. Delete `TenantResolveResponse` DTO from `Shared/DTOs/TenantDtos.cs`.
3. Delete `Shared/Models/Tenant.cs`, `Shared/Models/RefreshToken.cs`, `Shared/Models/PrmServiceRecord.cs`.
4. Strip the `Tenant` and `RefreshTokens` navigation properties from `Shared/Models/Employee.cs`; strip the `Employee` back-reference navigation from `Shared/Models/EmployeeAirport.cs`. Retain scalar fields and the `Employee.Airports` collection (the latter is still consumed by `AuthenticationService`).
5. Remove `Microsoft.EntityFrameworkCore` and `Pomelo.EntityFrameworkCore.MySql` from `PrmDashboard.Shared.csproj`.
6. Apply three forward concerns from Phase 3d-1's final review:
   a. Normalise `DuckDBParameter` re-wrapping pattern in `TrendService` (4 sites) and `RecordService.GetSegmentsAsync` (1 site).
   b. Flatten the unnecessarily nested `using` block in `RecordService.GetRecordsAsync`.
   c. Add an inline comment to `RecordService.GetRecordsAsync` explaining the `GROUP BY id + MIN(row_id)` dedup convention vs the `ROW_NUMBER()` pattern used elsewhere.
7. Full test suite remains at 134/134 (no test changes, no endpoint behaviour changes beyond the deletion of `/resolve` which has no callers).

## Non-goals

- Changing the `/config` or `/airports` endpoints on TenantService.
- Changing AuthService or PrmService public behaviour.
- Changing Shared DuckDB abstractions (`IDuckDbContext`, `DuckDbContext`, `TenantParquetPaths`, `DataPathValidator`, `DataPathOptions`, `TenantInfo`, `PooledDuckDbSession`).
- Changing the backend `tools/` (CsvExporter, ParquetBuilder) — they don't reference Shared and their own MySqlConnector dependency is out of scope (used for legacy MySQL → CSV export, not runtime).
- Changing `docker-compose.yml`, Gateway Ocelot config, frontend, or any of the init SQL under `database/init/`.
- Changing the per-tenant `master/tenants.parquet` schema — the parquet will still carry the now-unused `db_*` columns. Extra columns in a parquet file are ignored by DuckDB; the columns become historical deadweight but removing them requires regenerating every tenant's parquet, which is Phase 1's scope to revisit later.
- Adding integration tests for the deleted endpoint — it's gone, not replaced.

## Target end state

After this phase:

```text
backend/src/PrmDashboard.Shared/
├── Data/                            (unchanged — DuckDB abstractions)
│   ├── DataPathOptions.cs
│   ├── DataPathValidator.cs
│   ├── DuckDbContext.cs
│   ├── PooledDuckDbSession.cs
│   └── TenantParquetPaths.cs
├── DTOs/                            (one DTO record removed)
│   ├── AuthDtos.cs                  (unchanged)
│   ├── BreakdownDtos.cs             (unchanged)
│   ├── KpiDtos.cs                   (unchanged)
│   ├── PerformanceDtos.cs           (unchanged)
│   ├── PrmFilterParams.cs           (unchanged)
│   ├── RankingDtos.cs               (unchanged)
│   ├── RecordDtos.cs                (unchanged)
│   ├── TenantDtos.cs                (TenantResolveResponse removed; TenantConfigResponse + AirportDto kept)
│   └── TrendDtos.cs                 (unchanged)
├── Extensions/                      (unchanged — TimeHelpers)
├── Logging/                         (unchanged)
├── Middleware/                      (unchanged)
└── Models/                          (vestigial EF entities trimmed)
    ├── Employee.cs                  (Tenant + RefreshTokens navs removed; Airports kept)
    ├── EmployeeAirport.cs           (Employee back-ref nav removed; scalars kept)
    └── TenantInfo.cs                (unchanged)

Deleted from Shared:
- Models/Tenant.cs
- Models/RefreshToken.cs
- Models/PrmServiceRecord.cs
- DTOs/TenantDtos.cs::TenantResolveResponse
```

`PrmDashboard.Shared.csproj`:

```xml
<!-- BEFORE -->
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.11" />
<PackageReference Include="Pomelo.EntityFrameworkCore.MySql" Version="8.0.2" />

<!-- AFTER: both removed -->
```

`TenantService/Controllers/TenantController.cs`: only two endpoints remain (`/config`, `/airports`).

`TenantService/Services/TenantResolutionService.cs`: only `GetConfigAsync` + `GetAirportsForEmployeeAsync` remain; `ResolveAsync` and the internal `LegacyTenantResolveData` record are gone.

## Decisions

| Decision | Value | Why |
|---|---|---|
| `/resolve/{slug}` removal | Full endpoint + handler + DTO + service method + internal record, all in one commit | No callers in the codebase after Phase 3d-1 (`grep` verified). Keeping the endpoint alive serves no purpose and carries EF-era data shapes. |
| `Shared/Models/Tenant.cs` | Delete entire class | All scalar fields (db_*) are only consumed by `TenantResolveResponse`; the `Employees` nav has no runtime reader. `TenantInfo` already serves as the canonical tenant record. |
| `Shared/Models/RefreshToken.cs` | Delete entire class | AuthService's `InMemoryRefreshTokenStore` is the runtime store (phase 3b). The EF entity is unused. |
| `Shared/Models/PrmServiceRecord.cs` | Delete entire class | PrmService no longer materialises `PrmServiceRecord` (phase 3d-1 translated all queries to raw SQL over Parquet). The type has zero runtime readers. |
| `Employee.Tenant` nav | Delete | The scalar `Employee.TenantId` is retained; the nav was EF-only. |
| `Employee.RefreshTokens` nav | Delete | Dead alongside `RefreshToken.cs`. |
| `EmployeeAirport.Employee` back-ref | Delete | EF-only back-reference with no readers. |
| `EmployeeAirport.Id`, `EmployeeId`, `AirportCode`, `AirportName` | Retain | Used by `AuthenticationService.LookupEmployeeByUsernameAsync`/`LookupEmployeeByIdAsync`. |
| `Employee.Id`, `TenantId`, `Username`, `PasswordHash`, `DisplayName`, `Email`, `IsActive`, `CreatedAt`, `LastLogin` | Retain | Used by `AuthenticationService` and `JwtService`. |
| Package removal | Drop `Microsoft.EntityFrameworkCore` + `Pomelo.EntityFrameworkCore.MySql` from `PrmDashboard.Shared.csproj` | Self-verifying: the build breaks if anything still depends on these. |
| `MySqlConnector` in tools | Leave alone | `PrmDashboard.CsvExporter` is a one-shot legacy-data export utility and genuinely still reads MySQL. Out of runtime scope. |
| Forward concern: parameter re-wrapping in TrendService/RecordService | Apply in this phase | Spec reviewer on Phase 3d-1 flagged this as a maintenance trap (base class documents the invariant; these five call sites violate it but are harmless today because they each attach to exactly one command). Normalising now prevents accidental reuse. |
| Forward concern: RecordService.GetRecordsAsync nested using | Apply in this phase | Unnecessary indentation depth. Cheap to fix; improves readability. |
| Forward concern: RecordService dedup comment | Apply in this phase | One-line explanation that `GROUP BY id + MIN(row_id)` is equivalent to `ROW_NUMBER()` here. |
| Parquet schema | Leave db_* columns in `tenants.parquet` | Removing them requires regenerating every tenant parquet (Phase 1 territory). DuckDB ignores unread columns. Document the vestige in the migration completion note. |
| `appsettings` | No changes | `TenantServiceUrl` was removed from PrmService in 3d-1. TenantService and AuthService never had the resolve-caller config. |
| `docker-compose.yml` | No changes | The `/resolve` endpoint is a URL path — removing it doesn't change any compose config. |
| Gateway Ocelot routes | No changes | `/resolve` was never exposed through the gateway (it was internal). |
| Test count | 134 → 134 | `ResolveAsync` had no dedicated tests in the TenantService test class (confirmed: `TenantResolutionServiceTests` covers `GetConfigAsync` + `GetAirportsForEmployeeAsync` but not `ResolveAsync`). So removing it doesn't change test count. |
| Frontend | No changes | `/resolve` was service-to-service only. |
| Commit granularity | 2 commits: one for the deletions + EF package drop, one for the polish fixes | Keeps the "no behaviour change" deletion atomic; polish is pure cleanup. |

## File inventory

Created: **none** (pure deletion + edit phase).

Modified:

- `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj` — drop two PackageReferences.
- `backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs` — remove `TenantResolveResponse` record.
- `backend/src/PrmDashboard.Shared/Models/Employee.cs` — remove `Tenant` + `RefreshTokens` navs.
- `backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs` — remove `Employee` back-ref nav.
- `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs` — remove `Resolve` action + its doc comment.
- `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs` — remove `ResolveAsync` + `LegacyTenantResolveData` record + its internal using/DTOs.
- `backend/src/PrmDashboard.PrmService/Services/TrendService.cs` — 4 call sites: `cmd.Parameters.Add(p)` → `cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value))`.
- `backend/src/PrmDashboard.PrmService/Services/RecordService.cs` — `GetSegmentsAsync`: same parameter re-wrapping; `GetRecordsAsync`: flatten the nested `using (var countCmd ...) { await using var cmd = ... }` into sibling blocks; add one-line comment explaining the dedup convention.

Deleted:

- `backend/src/PrmDashboard.Shared/Models/Tenant.cs`
- `backend/src/PrmDashboard.Shared/Models/RefreshToken.cs`
- `backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs`

**No other files** are touched. In particular, no tool changes, no test changes (except incidentally if a test inadvertently referenced a deleted type, but none do — verified via grep).

## Success criteria

1. `grep -rn "Microsoft.EntityFrameworkCore\|Pomelo.EntityFrameworkCore\|MySqlConnector" backend/src --include="*.cs" --include="*.csproj"` returns zero matches.
2. `grep -rn "TenantResolveResponse\|LegacyTenantResolveData\|class Tenant\b\|class RefreshToken\b\|class PrmServiceRecord\b" backend/src --include="*.cs"` returns zero matches (class declarations).
3. `grep -rn "api/tenants/resolve\|/resolve/" backend/src --include="*.cs"` returns zero matches.
4. `grep -rn "public Tenant Tenant\b\|public ICollection<RefreshToken>\|public Employee Employee\b" backend/src/PrmDashboard.Shared --include="*.cs"` returns zero matches (deleted EF navs).
5. Solution builds 0/0 (errors/warnings).
6. All 134 tests pass.
7. No changes outside the file inventory above — verifiable via `git diff --stat main..HEAD`.
8. Phase 3d-1 forward concerns resolved: `TrendService.cs` has zero `cmd.Parameters.Add(p)` calls against raw `parms` items; `RecordService.GetRecordsAsync` is not nested inside `GetRecordsAsync`'s count block; `RecordService.GetRecordsAsync` carries an inline dedup-convention comment.

## Open items to resolve during implementation

1. **Shared EF package removal — nothing breaks transitively?** `Microsoft.EntityFrameworkCore` and `Pomelo.EntityFrameworkCore.MySql` are the only two package references on `Shared.csproj` tagged as EF-related. Removing them should cause the build to fail fast if anything still imports `using Microsoft.EntityFrameworkCore;` or uses `DbContext`. Based on the grep across the 3d-1 merge, nothing does. Verify during task 1 of the plan.
2. **`Employee.cs` scalar-field trimming?** Current fields: `Id, TenantId, Username, PasswordHash, DisplayName, Email, IsActive, CreatedAt, LastLogin`. All are read by AuthService. Keep them all — the class is a pure data-transport record now, not an EF entity. Do NOT convert it to a `record` (would break the setter-based construction in `AuthenticationService.LookupEmployeeByUsernameAsync`).
3. **`EmployeeAirport` scalar-field trimming?** Current fields: `Id, EmployeeId, AirportCode, AirportName`. All four used by AuthService. Keep.
4. **Swashbuckle / OpenAPI docs for `/resolve`?** Deleting the endpoint also removes it from the generated OpenAPI document. No action needed — ASP.NET Core regenerates the doc at startup.
5. **`Shared/Models` folder keep vs delete?** After the deletions, `Models/` still has `Employee.cs`, `EmployeeAirport.cs`, `TenantInfo.cs`. Keep the folder.
