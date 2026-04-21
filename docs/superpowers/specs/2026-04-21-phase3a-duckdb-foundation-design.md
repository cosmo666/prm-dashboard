# Phase 3a — DuckDB Foundation — Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Scope:** Add the shared primitives that Phase 3b (AuthService), 3c (TenantService), and 3d (PrmService) will use to talk to DuckDB + Parquet. Introduces a pooled `IDuckDbContext`, a typed `DataPathOptions`, a `TenantParquetPaths` helper, and a new `TenantInfo` record. Fully additive: no existing service code is modified or deleted in this phase.

## Goals

1. Provide a thread-safe, pool-backed DuckDB access primitive that the three services can share as a singleton.
2. Add a `TenantInfo` record so services can start migrating away from the EF `Tenant` entity in a controlled fashion.
3. Centralize `data/`-folder path construction in a single helper so no service builds Parquet paths by string concatenation.
4. Keep the existing MySQL/EF stack fully functional — this phase changes nothing about how services run today.

## Non-goals

- Swapping any service to use `IDuckDbContext` — that's 3b/3c/3d.
- Removing EF packages from any service — same, 3b/3c/3d.
- Deleting the `Tenant` class, `SchemaMigrator`, `DbContext`-related code — all happens in the per-service specs.
- Enforcing read-only SQL at runtime. `ParquetBuilder` is the only writer, offline. Convention, not enforcement.
- Providing a higher-level "query helper" API on top of the connection. Callers write plain ADO.NET.

## Target architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Any service (AuthService / TenantService / PrmService)          │
│                                                                  │
│    ctor(IDuckDbContext duck, TenantParquetPaths paths, …) { … }  │
│                                                                  │
│    await using var session = await duck.AcquireAsync(ct);        │
│    await using var cmd = session.Connection.CreateCommand();     │
│    cmd.CommandText = $"SELECT … FROM '{paths.MasterEmployees}'"; │
└────────────────────────┬─────────────────────────────────────────┘
                         │ (singleton, DI)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  PrmDashboard.Shared.Data.DuckDbContext : IDuckDbContext         │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Microsoft.Extensions.ObjectPool.DefaultObjectPool<     │   │
│   │      DuckDBConnection>                                  │   │
│   │                                                         │   │
│   │  [conn1][conn2][conn3]  …  [conn16]                     │   │
│   │   ^^^^^^                                                │   │
│   │   each: new DuckDBConnection("DataSource=:memory:")     │   │
│   │   each: its own buffer pool, reads external Parquet     │   │
│   │         files via path — no shared in-memory state      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Disposes all connections on IHostApplicationLifetime.Stopping   │
└─────────────────────────────────────────────────────────────────┘
```

Services get a `PooledDuckDbSession` from `AcquireAsync`. The session wraps one pooled connection. When the session disposes (`await using`), the connection returns to the pool. Connections live for the lifetime of the process; their Parquet-schema and buffer-pool caches warm up across reuses.

## Decisions

| Decision | Value | Why |
|---|---|---|
| Connection lifecycle | Singleton pool of `DuckDBConnection`, acquired per-request via `PooledDuckDbSession` wrapper | `DuckDBConnection` is not thread-safe for concurrent commands (standard ADO.NET); a pure singleton serializes all requests, per-request-fresh loses cache warmth. Pool gets both: concurrency + warm caches. |
| Pool size default | 16 | Covers POC load (3 tenants × 4 employees × 2–3 concurrent queries ≈ 30 max) with headroom. |
| Pool size tunable | `DataPath:PoolSize` in appsettings, bounds [1, 64] | Dev/prod override without code change. Bounds guard against typo'd huge values. |
| Connection string | `"DataSource=:memory:"` | Each pool connection gets an isolated in-memory DuckDB engine. Parquet files are read as external tables via path — no shared in-memory state needed. |
| Data path resolution | Env var `PRM_DATA_PATH` takes precedence; falls back to `DataPath` in appsettings; throws at startup if neither set or path missing | Matches existing `MASTER_CONNECTION_STRING` pattern; works in docker-compose and local dev; fails fast. |
| Startup validation | Resolved path and `{path}/master` directory must exist at service startup — throw `InvalidOperationException` otherwise | Same fail-fast posture as today's `Jwt:Secret` check in `TenantService/Program.cs`. Prevents "serves 500s on first request" failure modes. |
| `TenantInfo` shape | `sealed record TenantInfo(int Id, string Name, string Slug, bool IsActive, DateTime CreatedAt, string? LogoUrl, string PrimaryColor)` | All current `Tenant` fields minus the five `Db*` columns minus `GetConnectionString()` minus the `Employees` navigation. Immutable. Seven fields. |
| `TenantInfo` location | `backend/src/PrmDashboard.Shared/Models/TenantInfo.cs` | Sibling to existing `Tenant.cs` during the migration. Old `Tenant` stays; new `TenantInfo` is adopted by 3b/3c/3d. |
| Old `Tenant` class | Untouched in 3a — retired later | 3a must be fully additive. Old class dies in the cleanup step of 3d once no callers remain. |
| Path helper | `TenantParquetPaths` singleton with strongly-typed properties (`MasterTenants`, `MasterEmployees`, `MasterEmployeeAirports`) and method `TenantPrmServices(slug)` | Prevents ad-hoc `Path.Combine(root, slug, "foo.parquet")` scattered across services. One place to change the layout. |
| Read-only enforcement | None | Only `ParquetBuilder` (offline tool, not a runtime service) writes. Adding runtime guards would be noise. |
| Query API style | Plain ADO.NET — callers use `session.Connection.CreateCommand()` themselves | Higher-level helpers (`ExecuteScalarAsync<T>(sql, params)`) hide SQL and obscure parameter binding. The 19 PRM endpoints will each write raw SQL; keep the primitive raw. |

## File structure

New files in `backend/src/PrmDashboard.Shared/`:

```text
Data/
├── DataPathOptions.cs           # typed options (Root, PoolSize) + constants
├── DataPathValidator.cs         # IHostedService: fails startup if {Root}/master missing
├── DuckDbContext.cs             # IDuckDbContext + concrete impl with pool
├── PooledDuckDbSession.cs       # IAsyncDisposable wrapper; returns conn on dispose
└── TenantParquetPaths.cs        # path construction helper
Models/
└── TenantInfo.cs                # new record
```

New files in `backend/tests/PrmDashboard.Tests/`:

```text
Data/
├── DataPathOptionsTests.cs         # resolution precedence + validation
├── TenantParquetPathsTests.cs      # path construction
└── DuckDbContextTests.cs           # integration: real Parquet, pool behavior
```

Modified files:

- `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj` — add `DuckDB.NET.Data` and `DuckDB.NET.Bindings.Full` + `Microsoft.Extensions.ObjectPool` + `Microsoft.Extensions.Options` package references.

**No other files are modified.** In particular: no service's `Program.cs`, no `DbContext`, no `appsettings.json`, no `docker-compose.yml`.

## Components

### `DataPathOptions`

```csharp
public sealed class DataPathOptions
{
    public const string SectionName = "DataPath";
    public const int DefaultPoolSize = 16;
    public const int MinPoolSize = 1;
    public const int MaxPoolSize = 64;

    public string Root { get; set; } = "";
    public int PoolSize { get; set; } = DefaultPoolSize;
}
```

Registered via `builder.Services.Configure<DataPathOptions>(o => { … })` in each service's `Program.cs`. The `Program.cs` wiring itself lands in 3b/3c/3d when each service starts using the foundation — 3a just defines the class and the intended wiring shape in documentation.

### `DataPathValidator`

```csharp
public sealed class DataPathValidator : IHostedService
{
    private readonly DataPathOptions _options;

    public DataPathValidator(IOptions<DataPathOptions> options) => _options = options.Value;

    public Task StartAsync(CancellationToken ct)
    {
        if (!Directory.Exists(_options.Root))
            throw new InvalidOperationException($"Data path does not exist: {_options.Root}");
        var masterDir = Path.Combine(_options.Root, "master");
        if (!Directory.Exists(masterDir))
            throw new InvalidOperationException($"Master data directory missing: {masterDir}");
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
```

Registered as `AddHostedService<DataPathValidator>()` by each service that uses the foundation. Fails startup if the configured root directory or its `master/` subdirectory is missing. No per-tenant validation here — tenants can be added at runtime and may not exist yet at startup, but master data is always required.

### `IDuckDbContext` + `DuckDbContext`

```csharp
public interface IDuckDbContext
{
    Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default);
}

public sealed class DuckDbContext : IDuckDbContext, IDisposable
{
    private readonly ObjectPool<DuckDBConnection> _pool;
    private readonly DefaultObjectPoolProvider _provider;

    public DuckDbContext(IOptions<DataPathOptions> options)
    {
        _provider = new DefaultObjectPoolProvider { MaximumRetained = options.Value.PoolSize };
        _pool = _provider.Create(new DuckDbConnectionPooledPolicy());
    }

    public async Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default)
    {
        var conn = _pool.Get();
        if (conn.State != ConnectionState.Open)
            await conn.OpenAsync(ct);
        return new PooledDuckDbSession(conn, _pool);
    }

    public void Dispose() { /* drain pool; dispose all connections */ }
}
```

Internal `DuckDbConnectionPooledPolicy : PooledObjectPolicy<DuckDBConnection>` constructs `new DuckDBConnection("DataSource=:memory:")` and returns true from `Return` (reuse freely).

### `PooledDuckDbSession`

```csharp
public sealed class PooledDuckDbSession : IAsyncDisposable
{
    public DuckDBConnection Connection { get; }
    private readonly ObjectPool<DuckDBConnection> _pool;

    internal PooledDuckDbSession(DuckDBConnection conn, ObjectPool<DuckDBConnection> pool)
    { Connection = conn; _pool = pool; }

    public ValueTask DisposeAsync()
    {
        _pool.Return(Connection);
        return ValueTask.CompletedTask;
    }
}
```

The key invariant: consumers get a session, use `session.Connection` for ADO.NET calls, and rely on `await using` to return the connection to the pool. There is no way to accidentally leak a connection short of forgetting the `await using`.

### `TenantParquetPaths`

```csharp
public sealed class TenantParquetPaths
{
    private readonly string _root;

    public TenantParquetPaths(IOptions<DataPathOptions> options)
    {
        _root = options.Value.Root;
    }

    public string MasterTenants => Path.Combine(_root, "master", "tenants.parquet");
    public string MasterEmployees => Path.Combine(_root, "master", "employees.parquet");
    public string MasterEmployeeAirports => Path.Combine(_root, "master", "employee_airports.parquet");
    public string TenantPrmServices(string slug) => Path.Combine(_root, slug, "prm_services.parquet");
}
```

Singleton. Consumers inject it and concatenate its properties into SQL literals.

### `TenantInfo`

```csharp
public sealed record TenantInfo(
    int Id,
    string Name,
    string Slug,
    bool IsActive,
    DateTime CreatedAt,
    string? LogoUrl,
    string PrimaryColor);
```

Used by 3b (for the employee lookup response), 3c (as the new tenant-resolution return type), and 3d (for the tenant config endpoint). Not mapped by EF, not referenced by `Tenant`.

## Startup wiring (for reference, implemented in 3b/3c/3d)

Each service's `Program.cs` adds one block:

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

// Startup validator — fail fast if data/ or data/master/ is missing
builder.Services.AddHostedService<DataPathValidator>();

builder.Services.AddSingleton<IDuckDbContext, DuckDbContext>();
builder.Services.AddSingleton<TenantParquetPaths>();
```

(`DataPathValidator` is a small `IHostedService` that runs at startup and throws if `{Root}` or `{Root}/master` is missing. It lives in Shared.)

## Testing strategy

All tests live in the existing `PrmDashboard.Tests` project.

### `DataPathOptionsTests.cs`

Pure unit tests for the resolution logic. Since resolution lives in each service's `Program.cs`, the tests verify the pieces that will be reused:

- `DataPathOptions` holds values unchanged
- Constants have the documented values (`Default=16`, `Min=1`, `Max=64`)

### `TenantParquetPathsTests.cs`

Pure unit tests:

- All four path-construction methods produce the documented layout given a known root
- Works on Windows paths (backslash) and on Unix paths (forward slash)
- `TenantPrmServices("aeroground")` returns the right string

### `DuckDbContextTests.cs`

Integration tests, using a temp directory + real Parquet files written by DuckDB itself at test setup:

- `AcquireAsync` returns a session whose connection is `Open`
- A second `AcquireAsync` call after dispose reuses the same native connection (pool behavior)
- Concurrent `AcquireAsync` calls (up to pool size) return distinct connections and all succeed within a bounded wallclock
- A query against a real Parquet file via `'path'` literal returns the expected row count
- Dispose drains the pool and closes all connections

~15–20 tests total. Run alongside existing suites.

## Success criteria

1. `PrmDashboard.Shared` exports `IDuckDbContext`, `DuckDbContext`, `PooledDuckDbSession`, `DataPathOptions`, `TenantParquetPaths`, `TenantInfo`.
2. `PrmDashboard.Shared.csproj` has the four new package references (`DuckDB.NET.Data`, `DuckDB.NET.Bindings.Full`, `Microsoft.Extensions.ObjectPool`, `Microsoft.Extensions.Options`).
3. All existing services still build (they don't reference the new types yet).
4. All pre-existing tests still pass (43 today).
5. New test suite in `backend/tests/PrmDashboard.Tests/Data/` adds 15+ passing tests.
6. `git grep "MySqlConnector\|Pomelo"` still finds the same matches as today — Foundation does not touch the MySQL stack.

## Open items to resolve during implementation

1. **Does `DuckDB.NET.Data 1.5.0` support concurrent command execution on separate connections from the same process?** Almost certainly yes (it's the canonical DuckDB usage pattern), but the concurrent-acquire integration test is where we confirm it. If it doesn't, fall back to a smaller pool size (1–2) and live with serialization — still better than a pure singleton because command state doesn't leak.
2. **Is `Microsoft.Extensions.ObjectPool` a transitive dependency of anything already in the csproj?** If yes, no new package reference needed. If no, add it explicitly.
3. **Exact package versions.** Let `dotnet add package` resolve and pin whatever's current on NuGet at implementation time, matching the Phase 2 approach.
