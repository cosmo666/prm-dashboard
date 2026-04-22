# Phase 3c — TenantService Swap — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Scope:** Replace the TenantService's EF Core + MySQL data access with DuckDB reads over `master/*.parquet`, and delete the `SchemaMigrator` + embedded SQL migrations. External endpoint contracts are preserved verbatim so PrmService (still on EF+MySQL during this phase) continues to work. Depends on Phase 3a foundation primitives.

## Goals

1. `TenantResolutionService` reads tenant/airport data from `master/*.parquet` via the Phase 3a `IDuckDbContext` + `TenantParquetPaths`.
2. Delete `SchemaMigrator` and its embedded SQL migrations — Parquet schema IS the schema.
3. Replace the 5-minute `IMemoryCache` for tenant config with a startup-loaded `Lazy<IReadOnlyDictionary<string, TenantInfo>>`.
4. All three endpoints (`/config`, `/resolve/{slug}`, `/airports`) remain behaviorally identical so PrmService continues resolving tenants via the legacy HTTP path until Phase 3d swaps it.
5. `MySqlConnector`, `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore` dropped from `PrmDashboard.TenantService.csproj`.

## Non-goals

- Touching AuthService (Phase 3b, already merged) or PrmService (Phase 3d).
- Introducing a shared `TenantLookup` helper in `PrmDashboard.Shared` — two call sites today (Auth + Tenant) don't justify the abstraction. A later phase can unify.
- Changing the `/resolve/{slug}` response shape or removing the endpoint — PrmService still calls it. 3d rewrites both the caller and eventually removes the endpoint.
- Deleting `Shared/Models/Tenant.cs`, `Shared/Models/RefreshToken.cs`, or `Employee.RefreshTokens` navigation — still referenced by PrmService's EF code.
- Modifying `docker-compose.yml`, Gateway Ocelot config, or the frontend.
- Rewriting the seed `BCRYPT_PENDING:` values, the legacy `db_*` columns in `tenants.parquet`, or the `Tenant.cs` EF entity's DB-connection fields.

## Target architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│  TenantController (unchanged)                                        │
│    GET /config  (public)                                             │
│    GET /resolve/{slug}  (Authorize — called by PrmService)           │
│    GET /airports  (Authorize — called by frontend via gateway)       │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ injects
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TenantResolutionService (rewritten)                                 │
│                                                                      │
│    ctor(IDuckDbContext duck, TenantParquetPaths paths,               │
│         TenantsLoader loader, ILogger ...)                           │
│                                                                      │
│    GetConfigAsync(slug):                                             │
│      1. loader.ConfigBySlug.Value.TryGetValue(slug, out var info)    │
│      2. return new TenantConfigResponse(info.Id, info.Name,          │
│             info.Slug, info.LogoUrl, info.PrimaryColor) or null      │
│                                                                      │
│    ResolveAsync(slug):                                               │
│      1. acquire DuckDB session                                       │
│      2. SELECT id, db_host, db_port, db_name, db_user, db_password   │
│         FROM 'tenants.parquet' WHERE slug = $s AND is_active         │
│      3. return TenantResolveResponse or null                         │
│                                                                      │
│    GetAirportsForEmployeeAsync(employeeId):                          │
│      1. acquire DuckDB session                                       │
│      2. SELECT airport_code, airport_name                            │
│         FROM 'employee_airports.parquet' WHERE employee_id = $eid    │
│      3. return List<AirportDto>                                      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TenantsLoader : IHostedService  (new)                               │
│                                                                      │
│    private Lazy<IReadOnlyDictionary<string, TenantInfo>> _configs;   │
│    public IReadOnlyDictionary<string, TenantInfo> ConfigBySlug;      │
│                                                                      │
│    StartAsync:                                                       │
│      1. acquire DuckDB session                                       │
│      2. SELECT id, name, slug, is_active, created_at,                │
│             logo_url, primary_color                                  │
│         FROM 'tenants.parquet' WHERE is_active                       │
│      3. build Dictionary<string slug, TenantInfo>                    │
│      4. store in _configs via Lazy                                   │
│                                                                      │
│    Runs alongside Phase 3a's DataPathValidator — both hosted         │
│    services must succeed for the app to start accepting traffic.     │
└─────────────────────────────────────────────────────────────────────┘
```

The three endpoints retain their existing DTOs:

```csharp
record TenantConfigResponse(int Id, string Name, string Slug, string? LogoUrl, string PrimaryColor);
record TenantResolveResponse(int TenantId, string DbHost, int DbPort, string DbName, string DbUser, string DbPassword);
record AirportDto(string Code, string Name);
```

## Decisions

| Decision | Value | Why |
|---|---|---|
| `/resolve/{slug}` endpoint contract | Unchanged — returns `TenantResolveResponse` with real DB connection values | Preserves inter-phase compat: PrmService's `TenantDbContextFactory` opens MySQL via these values until 3d swap. Vestigial `db_*` columns are in `tenants.parquet` (full-fidelity dump from Phase 1), so TenantService can serve the legacy shape from Parquet. |
| `/config` data source | Startup-loaded `Lazy<IReadOnlyDictionary<string, TenantInfo>>` via `TenantsLoader` | Hot path for every login page render. Dict lookup is free; eliminates the 5-min `IMemoryCache` TTL. |
| `/resolve` data source | Direct Parquet query per call | Rare (PrmService caches 5 min, ~1 call/min per tenant). Not worth caching in TenantService too. |
| `/airports` data source | Direct Parquet query per call | Called once per dashboard load. Response is small (<10 rows per employee). |
| `TenantsLoader` shape | `IHostedService` with `Lazy<IReadOnlyDictionary<string, TenantInfo>>` exposed as a property | Fails startup if `tenants.parquet` is missing or unreadable; `Lazy` defers the actual read until the dict is first accessed (after `StartAsync` completes). |
| `SchemaMigrator` | Deleted | Spec-mandated — Parquet schema IS the schema. |
| `Schema/Migrations/*.sql` + `<EmbeddedResource>` entry | Deleted | Dead artifact. |
| `MasterDbContext.cs` | Deleted | No longer used. |
| Package removal | Remove `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, `MySqlConnector` from `PrmDashboard.TenantService.csproj` | Forces compile-time verification. |
| Shared `TenantLookup` helper | Not introduced | Only Auth + Tenant use it; marginal DRY value. |
| `TenantInfo` | Adopt Phase 3a's record for the startup dict and `/config` response mapping | Consolidates around the new canonical shape. |
| `SchemaMigratorFilenameTests.cs` | Deleted along with the migrator | Tests for deleted code. |
| Startup wiring | Add `Configure<DataPathOptions>`, `AddHostedService<DataPathValidator>`, `AddSingleton<IDuckDbContext, DuckDbContext>`, `AddSingleton<TenantParquetPaths>`, `AddSingleton<TenantsLoader>`, `AddHostedService(sp => sp.GetRequiredService<TenantsLoader>())`. Remove `AddDbContext<MasterDbContext>`, `AddSingleton<SchemaMigrator>`, `AddMemoryCache` | Per Phase 3a foundation pattern + new loader. |

**Note on the `AddSingleton<TenantsLoader>` + `AddHostedService(sp => sp.GetRequiredService<TenantsLoader>())` double registration:** the standard pattern for a hosted service that's ALSO consumed by other services as an injected dependency. The first registration makes it injectable; the second tells the host to call `StartAsync`/`StopAsync` on the same instance.

## File structure

Modified:

- `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs` — major rewrite
- `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs` — untouched (DTOs and error shapes preserved; no call-site changes)
- `backend/src/PrmDashboard.TenantService/Program.cs` — swap DI wiring
- `backend/src/PrmDashboard.TenantService/PrmDashboard.TenantService.csproj` — remove 3 EF/MySQL packages + remove `<EmbeddedResource>` line
- `backend/src/PrmDashboard.TenantService/appsettings.Development.json` — replace `ConnectionStrings:MasterDb` with `DataPath`

Created:

- `backend/src/PrmDashboard.TenantService/Services/TenantsLoader.cs` — new hosted service (~50 LOC)
- `backend/tests/PrmDashboard.Tests/TenantService/TenantResolutionServiceTests.cs` — ~8 integration tests
- `backend/tests/PrmDashboard.Tests/TenantService/TenantsLoaderTests.cs` — ~3 tests

Deleted:

- `backend/src/PrmDashboard.TenantService/Services/SchemaMigrator.cs`
- `backend/src/PrmDashboard.TenantService/Schema/Migrations/001_create_prm_services.sql`
- `backend/src/PrmDashboard.TenantService/Schema/` (empty folder)
- `backend/src/PrmDashboard.TenantService/Data/MasterDbContext.cs`
- `backend/src/PrmDashboard.TenantService/Data/` (empty folder)
- `backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs`

**No other files** are modified. In particular, no AuthService/PrmService/Gateway code, no Shared models, no docker-compose, no frontend.

## Components

### `TenantsLoader` (new `IHostedService`)

```csharp
public sealed class TenantsLoader : IHostedService
{
    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly ILogger<TenantsLoader> _logger;

    private Lazy<IReadOnlyDictionary<string, TenantInfo>> _configsBySlug;

    public TenantsLoader(IDuckDbContext duck, TenantParquetPaths paths, ILogger<TenantsLoader> logger)
    {
        _duck = duck;
        _paths = paths;
        _logger = logger;
        _configsBySlug = new Lazy<IReadOnlyDictionary<string, TenantInfo>>(
            () => throw new InvalidOperationException("TenantsLoader not initialized. StartAsync must run first."));
    }

    public IReadOnlyDictionary<string, TenantInfo> ConfigBySlug => _configsBySlug.Value;

    public async Task StartAsync(CancellationToken ct)
    {
        var dict = await LoadAsync(ct);
        _configsBySlug = new Lazy<IReadOnlyDictionary<string, TenantInfo>>(() => dict);
        _logger.LogInformation("Loaded {Count} active tenants at startup", dict.Count);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    private async Task<IReadOnlyDictionary<string, TenantInfo>> LoadAsync(CancellationToken ct)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, name, slug, is_active, created_at, logo_url, primary_color
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE is_active
            """;

        var result = new Dictionary<string, TenantInfo>(StringComparer.Ordinal);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var info = new TenantInfo(
                Id: reader.GetInt32(0),
                Name: reader.GetString(1),
                Slug: reader.GetString(2),
                IsActive: reader.GetBoolean(3),
                CreatedAt: reader.GetDateTime(4),
                LogoUrl: reader.IsDBNull(5) ? null : reader.GetString(5),
                PrimaryColor: reader.GetString(6));
            result[info.Slug] = info;
        }
        return result;
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
```

Registered as BOTH `AddSingleton<TenantsLoader>()` AND `AddHostedService(sp => sp.GetRequiredService<TenantsLoader>())`. The `Lazy<T>` wrapping is a safety belt — the throw-on-access-before-start branch catches a misconfiguration rather than returning stale defaults.

### `TenantResolutionService` rewrite

Public API preserved:

```csharp
Task<TenantConfigResponse?> GetConfigAsync(string slug, CancellationToken ct);
Task<Tenant?> ResolveAsync(string slug, CancellationToken ct);
Task<List<AirportDto>> GetAirportsForEmployeeAsync(int employeeId, CancellationToken ct);
```

One signature note: `ResolveAsync` currently returns `Tenant?` (the EF entity). Under the rewrite it returns a new internal `LegacyTenantResolveData?` record to avoid referencing the legacy EF entity from DuckDB code. The `TenantController.Resolve` handler projects from the record to `TenantResolveResponse` unchanged.

```csharp
internal sealed record LegacyTenantResolveData(
    int Id,
    string Slug,
    string DbHost,
    int DbPort,
    string DbName,
    string DbUser,
    string DbPassword);
```

`TenantController.Resolve` updates from:

```csharp
return Ok(new TenantResolveResponse(
    tenant.Id, tenant.DbHost, tenant.DbPort, tenant.DbName,
    tenant.DbUser, tenant.DbPassword));
```

to:

```csharp
return Ok(new TenantResolveResponse(
    data.Id, data.DbHost, data.DbPort, data.DbName,
    data.DbUser, data.DbPassword));
```

Variable name change only — no logic change.

### SQL queries

```sql
-- Startup dict load (ran once by TenantsLoader.StartAsync)
SELECT id, name, slug, is_active, created_at, logo_url, primary_color
FROM '{paths.MasterTenants}'
WHERE is_active;

-- ResolveAsync (per call)
SELECT id, slug, db_host, db_port, db_name, db_user, db_password
FROM '{paths.MasterTenants}'
WHERE slug = $slug AND is_active
LIMIT 1;

-- GetAirportsForEmployeeAsync (per call)
SELECT airport_code, airport_name
FROM '{paths.MasterEmployeeAirports}'
WHERE employee_id = $eid
ORDER BY airport_code;
```

Parameterization via `new DuckDBParameter("slug", slug)` — same pattern as Phase 3b. Path literals interpolated via `EscapeSingleQuotes`.

## Startup wiring in `Program.cs`

Removed:

```csharp
var connStr = builder.Configuration.GetConnectionString("MasterDb")
    ?? throw new InvalidOperationException("ConnectionStrings:MasterDb is required");

builder.Services.AddDbContext<MasterDbContext>(opt =>
    opt.UseMySql(connStr, new MySqlServerVersion(new Version(8, 0, 36))));

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SchemaMigrator>();
```

Added:

```csharp
builder.Services.Configure<DataPathOptions>(o =>
{
    o.Root = Environment.GetEnvironmentVariable("PRM_DATA_PATH")
             ?? builder.Configuration["DataPath"]
             ?? throw new InvalidOperationException(
                 "Data path required: set PRM_DATA_PATH env var or DataPath in appsettings.");

    o.PoolSize = builder.Configuration.GetValue<int?>("DataPath:PoolSize")
                 ?? DataPathOptions.DefaultPoolSize;

    if (o.PoolSize < DataPathOptions.MinPoolSize || o.PoolSize > DataPathOptions.MaxPoolSize)
        throw new InvalidOperationException(
            $"DataPath:PoolSize out of range [{DataPathOptions.MinPoolSize}, {DataPathOptions.MaxPoolSize}]: {o.PoolSize}");
});

builder.Services.AddHostedService<DataPathValidator>();
builder.Services.AddSingleton<IDuckDbContext, DuckDbContext>();
builder.Services.AddSingleton<TenantParquetPaths>();

// TenantsLoader is both injectable (TenantResolutionService depends on it)
// AND runs as a hosted service for StartAsync-time dict population.
builder.Services.AddSingleton<TenantsLoader>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TenantsLoader>());
```

`AddScoped<TenantResolutionService>()` stays (unchanged registration).

## Testing strategy

All tests in `backend/tests/PrmDashboard.Tests/TenantService/`.

### `TenantsLoaderTests.cs` (~3 tests)

Integration against a temp Parquet fixture (same `IAsyncLifetime` pattern as Phase 3a/3b tests):

- `StartAsync_ValidParquet_PopulatesDict`
- `StartAsync_EmptyActive_ReturnsEmptyDict`
- `StartAsync_MissingParquet_Throws`

### `TenantResolutionServiceTests.cs` (~8 tests)

Integration with real Parquet fixture (tenants + employee_airports):

- `GetConfigAsync_KnownSlug_ReturnsConfig`
- `GetConfigAsync_UnknownSlug_ReturnsNull`
- `GetConfigAsync_InactiveSlug_ReturnsNull` (inactive row in fixture)
- `ResolveAsync_KnownSlug_ReturnsDbConnectionFields`
- `ResolveAsync_UnknownSlug_ReturnsNull`
- `ResolveAsync_InactiveSlug_ReturnsNull`
- `GetAirportsForEmployeeAsync_WithAirports_ReturnsList`
- `GetAirportsForEmployeeAsync_NoAirports_ReturnsEmpty`

Deleted: `backend/tests/PrmDashboard.Tests/TenantService/SchemaMigratorFilenameTests.cs` — tests for deleted code.

## Success criteria

1. `grep -E "MySqlConnector|Pomelo|EntityFrameworkCore|MasterDbContext|SchemaMigrator" backend/src/PrmDashboard.TenantService --include="*.cs" --include="*.csproj"` returns zero matches.
2. `Schema/`, `Data/`, `SchemaMigrator.cs`, `MasterDbContext.cs` all deleted; `SchemaMigratorFilenameTests.cs` deleted.
3. Three endpoints (`/config`, `/resolve/{slug}`, `/airports`) retain DTOs, status codes, and auth requirements.
4. Solution builds 0/0; all new tests pass. Total test count grows from 83 to ~83 + 11 - (SchemaMigratorFilenameTests count).
5. `docker compose up auth tenant mysql` + frontend login continues to work end-to-end (AuthService reads auth data from Parquet, TenantService reads tenant config from Parquet).
6. PrmService (still on EF+MySQL) continues to resolve tenants via `/resolve/{slug}` — legacy DTO shape preserved.
7. No scope leakage into AuthService/PrmService/Gateway/Shared.

## Open items to resolve during implementation

1. **`TenantsLoader` and `DataPathValidator` ordering at startup.** Both are hosted services; both run in DI registration order. `DataPathValidator` must run before `TenantsLoader` — if the data path is missing, `TenantsLoader` would get an opaque DuckDB error. Register `DataPathValidator` first in `Program.cs` (confirmed in the wiring block above).
2. **`Lazy<T>.Value` after StartAsync completes but before the app starts accepting requests.** `IHostedService.StartAsync` runs synchronously within `app.Run()`'s startup phase, so by the time any controller handler sees traffic, the dict is populated. Confirmed safe. The `Lazy<T>` wrapper is a belt-and-braces safety net for misconfigured scenarios (e.g., if someone accidentally forgets to register the hosted-service entry).
3. **Integration test for the `TenantsLoader` → `TenantResolutionService` flow.** The tests above exercise each service independently (building a TenantsLoader and passing it to TenantResolutionService). If the plan wants a full end-to-end test that exercises the DI wiring via `WebApplicationFactory`, flag it — not necessary for the swap itself.
