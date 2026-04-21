# Phase 3a — DuckDB Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared library primitives that Phases 3b/3c/3d will consume — a pooled `IDuckDbContext`, typed `DataPathOptions` config, an `IHostedService` validator, a `TenantParquetPaths` helper, and a `TenantInfo` record — all in `PrmDashboard.Shared`. Fully additive: no existing runtime service code is modified.

**Architecture:** One new `Data/` folder under `PrmDashboard.Shared` holding five classes and one record. `DuckDbContext` wraps a `Microsoft.Extensions.ObjectPool.DefaultObjectPool<DuckDBConnection>` and hands out `PooledDuckDbSession` wrappers that return the connection to the pool on `DisposeAsync`. Each connection is an isolated in-memory DuckDB engine; Parquet files are read as external tables via the path helper. Startup in future services validates the data path via a hosted service. New integration tests write real Parquet files to a temp directory at test setup and query them through the new context.

**Tech Stack:**
- .NET 8, `PrmDashboard.Shared` csproj already exists
- `DuckDB.NET.Data` 1.5.0 + `DuckDB.NET.Bindings.Full` 1.5.0 (matches versions pinned in ParquetBuilder from Phase 2)
- `Microsoft.Extensions.ObjectPool` (latest stable for net8.0)
- `Microsoft.Extensions.Options` (likely already transitively present; add explicitly if not)
- `Microsoft.Extensions.Hosting.Abstractions` for `IHostedService` (likely transitive; add explicitly if not)
- xUnit for tests (same `PrmDashboard.Tests` project, 43 existing tests all passing)

---

## Spec resolutions baked into this plan

The Phase 3a design spec (`docs/superpowers/specs/2026-04-21-phase3a-duckdb-foundation-design.md`) lists three open items to resolve during implementation. This plan locks them down:

1. **DuckDB.NET.Data concurrent-read behavior across pool connections** — verified empirically in Task 7's concurrent-acquire integration test. If the test surfaces serialization or exceptions, the plan will fall back to a smaller pool size but the API shape stays identical.
2. **Whether `Microsoft.Extensions.ObjectPool` is transitive in Shared today** — let Task 1's `dotnet add package` handle it: explicit PackageReference is harmless if the package is already transitive, and mandatory if it isn't.
3. **Exact package versions** — let `dotnet add package` pick the current stable on NuGet at implementation time. Record the resolved versions in Task 1's report. Target DuckDB versions match Phase 2 (1.5.0) to avoid drift; other packages pick latest stable.

---

## Files to create/modify

Create:
- `backend/src/PrmDashboard.Shared/Data/DataPathOptions.cs`
- `backend/src/PrmDashboard.Shared/Data/DataPathValidator.cs`
- `backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs`
- `backend/src/PrmDashboard.Shared/Data/PooledDuckDbSession.cs`
- `backend/src/PrmDashboard.Shared/Data/TenantParquetPaths.cs`
- `backend/src/PrmDashboard.Shared/Models/TenantInfo.cs`
- `backend/tests/PrmDashboard.Tests/Data/DataPathOptionsTests.cs`
- `backend/tests/PrmDashboard.Tests/Data/TenantParquetPathsTests.cs`
- `backend/tests/PrmDashboard.Tests/Data/DuckDbContextTests.cs`
- `backend/tests/PrmDashboard.Tests/Data/DataPathValidatorTests.cs`

Modify:
- `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj` — add four package references

**No other files are modified.** In particular, no service `Program.cs`, no `appsettings.json`, no `docker-compose.yml`, no existing models. Task 8's verification step grep-checks this.

---

## Pre-task: ensure branch is ready

From the repo root:

```bash
git status                    # should be clean
git log --oneline -1          # should show the plan-doc commit when this runs
```

Expected last commit: `757ff5e docs(spec): phase 3a DuckDB foundation design` (plus the plan-doc commit when this task runs). The branch is `phase3a-foundation`; all Phase-3a work lands there.

---

### Task 1: Add NuGet packages to `PrmDashboard.Shared`

Adds the four packages Shared needs to host the new Data classes. Does not use them yet — subsequent tasks import.

**Files:**
- Modify: `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj`

- [ ] **Step 1: Read the current csproj**

```bash
cat backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
```

Note the existing `<PackageReference>` entries (if any) and the target framework (`net8.0`). The file is short.

- [ ] **Step 2: Add `DuckDB.NET.Data` (match Phase 2 version)**

```bash
dotnet add backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj package DuckDB.NET.Data --version 1.5.0
```

Expected: `info : PackageReference for package 'DuckDB.NET.Data' version '1.5.0' added to file ...`.

- [ ] **Step 3: Add `DuckDB.NET.Bindings.Full` (match Phase 2 version)**

```bash
dotnet add backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj package DuckDB.NET.Bindings.Full --version 1.5.0
```

Expected: similar message. This ships native DuckDB binaries per RID and is what actually makes the thing runnable.

- [ ] **Step 4: Add `Microsoft.Extensions.ObjectPool`**

```bash
dotnet add backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj package Microsoft.Extensions.ObjectPool
```

Expected: picks the latest stable that's compatible with net8.0. Note the resolved version.

- [ ] **Step 5: Add `Microsoft.Extensions.Hosting.Abstractions` (for `IHostedService`)**

```bash
dotnet add backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj package Microsoft.Extensions.Hosting.Abstractions
```

Expected: picks the latest stable. This brings `IHostedService` into Shared so `DataPathValidator` compiles.

`Microsoft.Extensions.Options` is a transitive dependency of `Microsoft.Extensions.Hosting.Abstractions` and does not need to be added explicitly — but confirm via Step 6 that `IOptions<T>` is usable.

- [ ] **Step 6: Build — must succeed**

```bash
dotnet build backend/PrmDashboard.sln
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. Eight projects compile (5 services + Gateway, Shared, CsvExporter, ParquetBuilder, Tests).

(Note: `Microsoft.Extensions.Options` is a transitive of `Microsoft.Extensions.Hosting.Abstractions`. Task 3's test code uses `IOptions.Create(...)`, which will surface any `IOptions<T>` resolution problem naturally. If Task 3 Step 2 fails to compile citing `Options` — not the missing-type compile failure we want — add the package explicitly with `dotnet add ... package Microsoft.Extensions.Options` and re-run.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
git commit -m "chore(shared): add DuckDB + ObjectPool + Hosting packages for phase 3a"
```

---

### Task 2: Add `TenantInfo` record

Pure immutable record. Seven fields. Used by 3b/3c/3d.

**Files:**
- Create: `backend/src/PrmDashboard.Shared/Models/TenantInfo.cs`

- [ ] **Step 1: Write the record**

Write `backend/src/PrmDashboard.Shared/Models/TenantInfo.cs`:

```csharp
namespace PrmDashboard.Shared.Models;

/// <summary>
/// Post-migration tenant metadata shape. Drops the DB-connection columns
/// (DbHost/DbPort/DbName/DbUser/DbPassword) and EF navigation collections
/// that lived on the legacy <see cref="Tenant"/> entity. Services read these
/// from <c>master/tenants.parquet</c> via DuckDB.
/// </summary>
public sealed record TenantInfo(
    int Id,
    string Name,
    string Slug,
    bool IsActive,
    DateTime CreatedAt,
    string? LogoUrl,
    string PrimaryColor);
```

- [ ] **Step 2: Build — must succeed**

```bash
dotnet build backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/PrmDashboard.Shared/Models/TenantInfo.cs
git commit -m "feat(shared): add TenantInfo record (phase 3a)"
```

---

### Task 3: `DataPathOptions` with constants and unit tests

Typed options class for the data-path config. Constants govern pool-size bounds.

**Files:**
- Create: `backend/src/PrmDashboard.Shared/Data/DataPathOptions.cs`
- Create: `backend/tests/PrmDashboard.Tests/Data/DataPathOptionsTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/Data/DataPathOptionsTests.cs`:

```csharp
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DataPathOptionsTests
{
    [Fact]
    public void SectionName_IsExpectedValue()
    {
        Assert.Equal("DataPath", DataPathOptions.SectionName);
    }

    [Fact]
    public void DefaultPoolSize_Is16()
    {
        Assert.Equal(16, DataPathOptions.DefaultPoolSize);
    }

    [Fact]
    public void MinPoolSize_Is1()
    {
        Assert.Equal(1, DataPathOptions.MinPoolSize);
    }

    [Fact]
    public void MaxPoolSize_Is64()
    {
        Assert.Equal(64, DataPathOptions.MaxPoolSize);
    }

    [Fact]
    public void DefaultInstance_HasEmptyRoot_AndDefaultPoolSize()
    {
        var opts = new DataPathOptions();
        Assert.Equal("", opts.Root);
        Assert.Equal(DataPathOptions.DefaultPoolSize, opts.PoolSize);
    }

    [Fact]
    public void Properties_AreMutable()
    {
        // Options classes must be mutable so IConfiguration + Configure<T> can bind into them.
        var opts = new DataPathOptions { Root = "/tmp/data", PoolSize = 8 };
        Assert.Equal("/tmp/data", opts.Root);
        Assert.Equal(8, opts.PoolSize);
    }
}
```

- [ ] **Step 2: Run tests — must fail because `DataPathOptions` doesn't exist yet**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~DataPathOptionsTests"
```

Expected: compile error `CS0234: The type or namespace name 'Data' does not exist in the namespace 'PrmDashboard.Shared'` (or similar). Do not proceed until the test harness sees the missing type.

- [ ] **Step 3: Implement `DataPathOptions`**

Write `backend/src/PrmDashboard.Shared/Data/DataPathOptions.cs`:

```csharp
namespace PrmDashboard.Shared.Data;

/// <summary>
/// Runtime configuration for DuckDB/Parquet data access.
/// Populated via <see cref="Microsoft.Extensions.DependencyInjection.OptionsServiceCollectionExtensions"/>
/// <c>Configure&lt;DataPathOptions&gt;</c> in each service's <c>Program.cs</c>.
/// </summary>
public sealed class DataPathOptions
{
    public const string SectionName = "DataPath";
    public const int DefaultPoolSize = 16;
    public const int MinPoolSize = 1;
    public const int MaxPoolSize = 64;

    /// <summary>
    /// Absolute or relative path to the <c>data/</c> folder containing <c>master/*.parquet</c>
    /// and per-tenant <c>{slug}/prm_services.parquet</c>. Required; empty string fails startup
    /// validation.
    /// </summary>
    public string Root { get; set; } = "";

    /// <summary>
    /// Maximum number of <c>DuckDBConnection</c> instances retained in the pool. Tune for
    /// concurrent-user load; bounds are <see cref="MinPoolSize"/>..<see cref="MaxPoolSize"/>.
    /// </summary>
    public int PoolSize { get; set; } = DefaultPoolSize;
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~DataPathOptionsTests"
```

Expected: `Passed: 6`. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.Shared/Data/DataPathOptions.cs backend/tests/PrmDashboard.Tests/Data/DataPathOptionsTests.cs
git commit -m "feat(shared): add DataPathOptions with constants and tests"
```

---

### Task 4: `TenantParquetPaths` with unit tests

Centralizes Parquet path construction so no service ever does `Path.Combine(root, slug, "foo.parquet")` itself.

**Files:**
- Create: `backend/src/PrmDashboard.Shared/Data/TenantParquetPaths.cs`
- Create: `backend/tests/PrmDashboard.Tests/Data/TenantParquetPathsTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/Data/TenantParquetPathsTests.cs`:

```csharp
using System.IO;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class TenantParquetPathsTests
{
    private static TenantParquetPaths Build(string root)
    {
        var options = Options.Create(new DataPathOptions { Root = root });
        return new TenantParquetPaths(options);
    }

    [Fact]
    public void MasterTenants_BuildsRootSlashMasterSlashTenantsParquet()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "tenants.parquet"), paths.MasterTenants);
    }

    [Fact]
    public void MasterEmployees_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "employees.parquet"), paths.MasterEmployees);
    }

    [Fact]
    public void MasterEmployeeAirports_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "employee_airports.parquet"), paths.MasterEmployeeAirports);
    }

    [Fact]
    public void TenantPrmServices_WithSlug_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(
            Path.Combine("data", "aeroground", "prm_services.parquet"),
            paths.TenantPrmServices("aeroground"));
    }

    [Fact]
    public void TenantPrmServices_WithDifferentSlug_BuildsDifferentPath()
    {
        var paths = Build("data");
        Assert.NotEqual(paths.TenantPrmServices("aeroground"), paths.TenantPrmServices("skyserve"));
    }

    [Fact]
    public void AbsoluteRoot_IsPreservedInOutputs()
    {
        var root = Path.Combine(Path.GetTempPath(), "prm-data-root");
        var paths = Build(root);
        Assert.StartsWith(root, paths.MasterTenants);
        Assert.StartsWith(root, paths.TenantPrmServices("aeroground"));
    }
}
```

- [ ] **Step 2: Run tests — must fail because `TenantParquetPaths` doesn't exist yet**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~TenantParquetPathsTests"
```

Expected: compile error `CS0234` or `CS0246` citing `TenantParquetPaths`.

- [ ] **Step 3: Implement `TenantParquetPaths`**

Write `backend/src/PrmDashboard.Shared/Data/TenantParquetPaths.cs`:

```csharp
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Constructs absolute-or-relative filesystem paths to the Parquet files in the
/// data layout produced by <c>PrmDashboard.ParquetBuilder</c>:
/// <code>
/// {Root}/master/tenants.parquet
/// {Root}/master/employees.parquet
/// {Root}/master/employee_airports.parquet
/// {Root}/{slug}/prm_services.parquet
/// </code>
/// Registered as a singleton; pure, thread-safe.
/// </summary>
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

- [ ] **Step 4: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~TenantParquetPathsTests"
```

Expected: `Passed: 6`. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.Shared/Data/TenantParquetPaths.cs backend/tests/PrmDashboard.Tests/Data/TenantParquetPathsTests.cs
git commit -m "feat(shared): add TenantParquetPaths helper with tests"
```

---

### Task 5: `PooledDuckDbSession` + `IDuckDbContext` + `DuckDbContext`

Three tightly coupled types: session wrapper, interface, concrete implementation with pool. Committed together because splitting them produces uncompilable intermediate states.

**Files:**
- Create: `backend/src/PrmDashboard.Shared/Data/PooledDuckDbSession.cs`
- Create: `backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs`

No tests in this task — integration tests land in Task 6 once the types exist.

- [ ] **Step 1: Implement `PooledDuckDbSession`**

Write `backend/src/PrmDashboard.Shared/Data/PooledDuckDbSession.cs`:

```csharp
using DuckDB.NET.Data;
using Microsoft.Extensions.ObjectPool;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Borrows a <see cref="DuckDBConnection"/> from the <see cref="IDuckDbContext"/> pool.
/// Callers use <see cref="Connection"/> directly for ADO.NET work, then rely on
/// <c>await using</c> to return the connection to the pool on <see cref="DisposeAsync"/>.
/// Sessions are NOT thread-safe — use one session per concurrent unit of work.
/// </summary>
public sealed class PooledDuckDbSession : IAsyncDisposable
{
    public DuckDBConnection Connection { get; }
    private readonly ObjectPool<DuckDBConnection> _pool;
    private bool _disposed;

    internal PooledDuckDbSession(DuckDBConnection connection, ObjectPool<DuckDBConnection> pool)
    {
        Connection = connection;
        _pool = pool;
    }

    public ValueTask DisposeAsync()
    {
        if (_disposed) return ValueTask.CompletedTask;
        _disposed = true;
        _pool.Return(Connection);
        return ValueTask.CompletedTask;
    }
}
```

- [ ] **Step 2: Implement `IDuckDbContext` + `DuckDbContext`**

Write `backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs`:

```csharp
using System.Data;
using DuckDB.NET.Data;
using Microsoft.Extensions.ObjectPool;
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Hands out pooled DuckDB connections. Intended to be registered as a singleton.
/// Each connection is an isolated <c>:memory:</c> DuckDB engine; Parquet files are
/// read as external tables via path literals. Connections are thread-UNSAFE for
/// concurrent command execution — use one session per concurrent query.
/// </summary>
public interface IDuckDbContext
{
    /// <summary>
    /// Acquires a pooled connection. The returned session opens the connection if
    /// not already open, and returns it to the pool on dispose.
    /// </summary>
    Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default);
}

public sealed class DuckDbContext : IDuckDbContext
{
    private readonly ObjectPool<DuckDBConnection> _pool;

    public DuckDbContext(IOptions<DataPathOptions> options)
    {
        var poolSize = options.Value.PoolSize;
        if (poolSize < DataPathOptions.MinPoolSize || poolSize > DataPathOptions.MaxPoolSize)
        {
            throw new ArgumentOutOfRangeException(
                nameof(options),
                $"DataPath:PoolSize must be between {DataPathOptions.MinPoolSize} and {DataPathOptions.MaxPoolSize}, got {poolSize}.");
        }

        var provider = new DefaultObjectPoolProvider { MaximumRetained = poolSize };
        _pool = provider.Create(new DuckDbConnectionPolicy());
    }

    public async Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default)
    {
        var conn = _pool.Get();
        if (conn.State != ConnectionState.Open)
            await conn.OpenAsync(ct);
        return new PooledDuckDbSession(conn, _pool);
    }

    /// <summary>
    /// Pool policy — constructs fresh in-memory connections on demand, allows
    /// unconditional return to the pool after use.
    /// </summary>
    private sealed class DuckDbConnectionPolicy : PooledObjectPolicy<DuckDBConnection>
    {
        public override DuckDBConnection Create() => new DuckDBConnection("DataSource=:memory:");

        public override bool Return(DuckDBConnection obj) => true;
    }
}
```

- [ ] **Step 3: Build — must succeed**

```bash
dotnet build backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/PrmDashboard.Shared/Data/PooledDuckDbSession.cs backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs
git commit -m "feat(shared): add DuckDbContext pool + PooledDuckDbSession wrapper"
```

---

### Task 6: Integration tests for `DuckDbContext`

Write real Parquet files to a temp directory at test setup (using DuckDB itself), acquire sessions, run queries, verify concurrency and pool reuse.

**Files:**
- Create: `backend/tests/PrmDashboard.Tests/Data/DuckDbContextTests.cs`

- [ ] **Step 1: Write the test file**

Write `backend/tests/PrmDashboard.Tests/Data/DuckDbContextTests.cs`:

```csharp
using System.Collections.Concurrent;
using System.Data;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DuckDbContextTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private string _parquetPath = "";

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"duckdb-ctx-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
        _parquetPath = Path.Combine(_tempRoot, "fixture.parquet");

        // Write a fixture Parquet file with 5 rows via DuckDB itself.
        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();
        await using var cmd = setupConn.CreateCommand();
        cmd.CommandText =
            $"COPY (SELECT range AS id FROM range(5)) TO '{_parquetPath.Replace("'", "''")}' (FORMAT 'parquet')";
        await cmd.ExecuteNonQueryAsync();
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    private static DuckDbContext Build(int poolSize = 4)
    {
        var options = Options.Create(new DataPathOptions { Root = "unused-for-ctx-tests", PoolSize = poolSize });
        return new DuckDbContext(options);
    }

    [Fact]
    public async Task AcquireAsync_ReturnsOpenConnection()
    {
        var ctx = Build();
        await using var session = await ctx.AcquireAsync();
        Assert.Equal(ConnectionState.Open, session.Connection.State);
    }

    [Fact]
    public async Task AcquireAsync_CanQueryExternalParquet()
    {
        var ctx = Build();
        await using var session = await ctx.AcquireAsync();
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM '{_parquetPath.Replace("'", "''")}'";
        var count = System.Convert.ToInt64(await cmd.ExecuteScalarAsync());
        Assert.Equal(5L, count);
    }

    [Fact]
    public async Task DisposedSession_ReturnsConnectionToPool_NextAcquireReusesSameInstance()
    {
        var ctx = Build(poolSize: 1);
        DuckDBConnection first;
        await using (var s1 = await ctx.AcquireAsync())
        {
            first = s1.Connection;
        }
        await using var s2 = await ctx.AcquireAsync();
        Assert.Same(first, s2.Connection);
    }

    [Fact]
    public async Task ConcurrentAcquires_ReturnDistinctConnections()
    {
        var ctx = Build(poolSize: 8);
        var sessions = new ConcurrentBag<PooledDuckDbSession>();

        try
        {
            var tasks = Enumerable.Range(0, 8).Select(async _ =>
            {
                var session = await ctx.AcquireAsync();
                sessions.Add(session);
            }).ToArray();

            await Task.WhenAll(tasks);

            var connections = sessions.Select(s => s.Connection).ToList();
            Assert.Equal(8, connections.Count);
            Assert.Equal(8, connections.Distinct().Count()); // all distinct instances
        }
        finally
        {
            foreach (var s in sessions) await s.DisposeAsync();
        }
    }

    [Fact]
    public async Task ConcurrentQueries_AllComplete_AndProduceCorrectResults()
    {
        // Regression guard: confirms that multiple sessions can query simultaneously
        // without deadlock or cross-session corruption. This is the behavior the pool exists for.
        var ctx = Build(poolSize: 4);
        var countPath = _parquetPath.Replace("'", "''");

        var tasks = Enumerable.Range(0, 10).Select(async _ =>
        {
            await using var session = await ctx.AcquireAsync();
            await using var cmd = session.Connection.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(*) FROM '{countPath}'";
            return System.Convert.ToInt64(await cmd.ExecuteScalarAsync());
        }).ToArray();

        var results = await Task.WhenAll(tasks);
        Assert.All(results, r => Assert.Equal(5L, r));
    }

    [Fact]
    public async Task DoubleDispose_DoesNotDoubleReturnToPool()
    {
        var ctx = Build(poolSize: 1);
        var session = await ctx.AcquireAsync();
        await session.DisposeAsync();
        await session.DisposeAsync(); // must be a no-op

        // If dispose double-returned, the pool would have two instances and the next acquire
        // could pick either. We just verify that acquire still works and yields an open conn.
        await using var next = await ctx.AcquireAsync();
        Assert.Equal(ConnectionState.Open, next.Connection.State);
    }

    [Fact]
    public void Ctor_RejectsPoolSizeBelowMin()
    {
        var options = Options.Create(new DataPathOptions { PoolSize = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new DuckDbContext(options));
    }

    [Fact]
    public void Ctor_RejectsPoolSizeAboveMax()
    {
        var options = Options.Create(new DataPathOptions { PoolSize = 65 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new DuckDbContext(options));
    }
}
```

- [ ] **Step 2: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~DuckDbContextTests"
```

Expected: `Passed: 8`. Zero failures.

If `ConcurrentAcquires_ReturnDistinctConnections` or `ConcurrentQueries_AllComplete_AndProduceCorrectResults` fails with serialization errors or exceptions, capture the full stack trace and stop — that's the signal that the spec's open item #1 (concurrent-read behavior) needs different handling. The design fallback is to reduce pool size to 1 and accept serialization, but that's a last resort; first investigate whether the test itself has a bug (e.g., disposing sessions in the wrong order).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/PrmDashboard.Tests/Data/DuckDbContextTests.cs
git commit -m "test(shared): add integration tests for DuckDbContext pool"
```

---

### Task 7: `DataPathValidator` with unit tests

Hosted service that fails startup if the configured data path or its `master/` subdirectory is missing. Uses temp directories in tests.

**Files:**
- Create: `backend/src/PrmDashboard.Shared/Data/DataPathValidator.cs`
- Create: `backend/tests/PrmDashboard.Tests/Data/DataPathValidatorTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/Data/DataPathValidatorTests.cs`:

```csharp
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DataPathValidatorTests
{
    private static DataPathValidator Build(string root)
    {
        return new DataPathValidator(Options.Create(new DataPathOptions { Root = root }));
    }

    [Fact]
    public async Task StartAsync_RootMissing_Throws()
    {
        var missing = Path.Combine(Path.GetTempPath(), $"nonexistent-{System.Guid.NewGuid():N}");
        var validator = Build(missing);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            validator.StartAsync(CancellationToken.None));
        Assert.Contains(missing, ex.Message);
    }

    [Fact]
    public async Task StartAsync_MasterMissing_Throws()
    {
        var root = Path.Combine(Path.GetTempPath(), $"root-only-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var validator = Build(root);
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                validator.StartAsync(CancellationToken.None));
            Assert.Contains("master", ex.Message);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task StartAsync_RootAndMasterPresent_Succeeds()
    {
        var root = Path.Combine(Path.GetTempPath(), $"valid-{System.Guid.NewGuid():N}");
        var master = Path.Combine(root, "master");
        Directory.CreateDirectory(master);
        try
        {
            var validator = Build(root);
            // Must not throw
            await validator.StartAsync(CancellationToken.None);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task StopAsync_IsNoOp_DoesNotThrow()
    {
        var root = Path.Combine(Path.GetTempPath(), $"stop-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "master"));
        try
        {
            var validator = Build(root);
            await validator.StartAsync(CancellationToken.None);
            await validator.StopAsync(CancellationToken.None); // must not throw
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
```

- [ ] **Step 2: Run tests — must fail because `DataPathValidator` doesn't exist**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~DataPathValidatorTests"
```

Expected: compile error citing `DataPathValidator`.

- [ ] **Step 3: Implement `DataPathValidator`**

Write `backend/src/PrmDashboard.Shared/Data/DataPathValidator.cs`:

```csharp
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Startup gate: verifies the configured data path and its <c>master/</c> subdirectory
/// exist before the service accepts traffic. Register with
/// <c>services.AddHostedService&lt;DataPathValidator&gt;()</c>. Throws
/// <see cref="InvalidOperationException"/> on failure, which aborts service startup.
/// </summary>
public sealed class DataPathValidator : IHostedService
{
    private readonly DataPathOptions _options;

    public DataPathValidator(IOptions<DataPathOptions> options)
    {
        _options = options.Value;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.Root) || !Directory.Exists(_options.Root))
            throw new InvalidOperationException($"Data path does not exist: {_options.Root}");

        var masterDir = Path.Combine(_options.Root, "master");
        if (!Directory.Exists(masterDir))
            throw new InvalidOperationException($"Master data directory missing: {masterDir}");

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~DataPathValidatorTests"
```

Expected: `Passed: 4`. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.Shared/Data/DataPathValidator.cs backend/tests/PrmDashboard.Tests/Data/DataPathValidatorTests.cs
git commit -m "feat(shared): add DataPathValidator IHostedService with tests"
```

---

### Task 8: Final verification (no commit)

Confirm that (a) the full solution builds clean, (b) the complete test suite still passes — both pre-existing 43 tests and the new tests from Tasks 3/4/6/7, (c) no runtime service code was changed, (d) no MySQL/EF packages moved.

- [ ] **Step 1: Full solution build**

```bash
dotnet build backend/PrmDashboard.sln --nologo
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 2: Full test suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected tally: **67 total tests, 0 failed.** Breakdown:
- 43 pre-existing (17 CsvFormatter + 8 FileDiscovery + 18 other)
- 6 DataPathOptions (Task 3)
- 6 TenantParquetPaths (Task 4)
- 8 DuckDbContext (Task 6)
- 4 DataPathValidator (Task 7)

Total 67. If the count differs, stop and diagnose.

- [ ] **Step 3: Confirm no runtime service code was touched**

```bash
git diff --stat main..HEAD -- backend/src/PrmDashboard.AuthService backend/src/PrmDashboard.TenantService backend/src/PrmDashboard.PrmService backend/src/PrmDashboard.Gateway
```

Expected: empty output. Foundation is fully additive — none of the four service projects were modified.

- [ ] **Step 4: Confirm no MySQL/EF packages were added or removed**

```bash
git diff main..HEAD -- '*.csproj' | grep -E '^[+-].*PackageReference.*(MySql|Pomelo|EntityFramework)' || echo "no MySQL/EF package churn"
```

Expected: `no MySQL/EF package churn`. Phase 3a does not touch the MySQL stack.

- [ ] **Step 5: Confirm only Shared.csproj had package changes**

```bash
git diff --stat main..HEAD -- '*.csproj'
```

Expected: exactly two csproj files changed — `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj` (new packages) and possibly `backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj` if xUnit needed a package update (it should NOT — the test project already has everything it needs).

If the Tests csproj changed, that's fine — it was already supposed to stay stable, but test-time packages get added transparently in some workflows. Confirm the diff is innocuous.

- [ ] **Step 6: List all new files**

```bash
git diff --name-status main..HEAD -- 'backend/**/Data/**' 'backend/**/Models/TenantInfo.cs'
```

Expected output (or similar — paths may use different separators):

```text
A  backend/src/PrmDashboard.Shared/Data/DataPathOptions.cs
A  backend/src/PrmDashboard.Shared/Data/DataPathValidator.cs
A  backend/src/PrmDashboard.Shared/Data/DuckDbContext.cs
A  backend/src/PrmDashboard.Shared/Data/PooledDuckDbSession.cs
A  backend/src/PrmDashboard.Shared/Data/TenantParquetPaths.cs
A  backend/src/PrmDashboard.Shared/Models/TenantInfo.cs
A  backend/tests/PrmDashboard.Tests/Data/DataPathOptionsTests.cs
A  backend/tests/PrmDashboard.Tests/Data/DataPathValidatorTests.cs
A  backend/tests/PrmDashboard.Tests/Data/DuckDbContextTests.cs
A  backend/tests/PrmDashboard.Tests/Data/TenantParquetPathsTests.cs
```

Ten new files. Plus the plan and spec doc commits (ignored by this filter).

- [ ] **Step 7: Report**

This task has no commit. Report the final build summary, test tally, and the verification command outputs so the reviewer can confirm Phase 3a landed cleanly.

---

## Success criteria (recap from spec)

- [x] `PrmDashboard.Shared` exports `IDuckDbContext`, `DuckDbContext`, `PooledDuckDbSession`, `DataPathOptions`, `TenantParquetPaths`, `TenantInfo`, and `DataPathValidator`
- [x] `PrmDashboard.Shared.csproj` has four new package references (`DuckDB.NET.Data`, `DuckDB.NET.Bindings.Full`, `Microsoft.Extensions.ObjectPool`, `Microsoft.Extensions.Hosting.Abstractions` — plus `Microsoft.Extensions.Options` if not transitive)
- [x] Existing three services still build (Foundation is additive; verified in Task 8 Step 3)
- [x] All pre-existing tests still pass (43 → still 43 passing; verified in Task 8 Step 2)
- [x] New test suite adds 24 passing tests (6 + 6 + 8 + 4; total test count 67)
- [x] No MySQL/EF package churn (verified in Task 8 Step 4)
- [x] `IDuckDbContext` concurrency verified: distinct connections across concurrent acquires + concurrent queries succeed (Task 6 regression tests)
