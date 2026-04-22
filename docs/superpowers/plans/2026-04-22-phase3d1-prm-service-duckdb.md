# Phase 3d-1 — PrmService Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap `PrmDashboard.PrmService` from EF Core + MySQL (via HTTP → TenantService `/resolve`) to DuckDB + per-tenant Parquet. Rewrite all 25 analytics endpoints to run dedup + aggregation in SQL. Delete `TenantDbContextFactory`, `TenantDbContext`, `TenantNotFoundException` and the HTTP path from PrmService. The `/resolve` endpoint on TenantService stays behind (zero callers after this phase) — 3d-2 deletes it along with the vestigial DTOs and EF scaffolding.

**Architecture:** Gateway injects `X-Tenant-Slug`; `PrmControllerBase.GetTenantSlug()` reads it; each service computes its Parquet path via `TenantParquetPaths.TenantPrmServices(slug)` — no lookup, no HTTP. Services inherit a new `SqlBaseQueryService` (renamed to `BaseQueryService` at end of migration) that exposes a static `BuildWhereClause(filters)` → `(sqlFragment, parameters)` and injects `IDuckDbContext` + `TenantParquetPaths`. Each method: acquire DuckDB session, compose SQL, run, project to DTO. HHMM time arithmetic baked into SQL via a `HhmmSql` helper.

**Tech Stack:**
- .NET 8 PrmService project (already exists)
- Phase 3a foundation from `PrmDashboard.Shared` (`IDuckDbContext`, `TenantParquetPaths`, `DataPathOptions`, `DataPathValidator`) — all available via the existing `<ProjectReference>` to Shared
- `DuckDB.NET.Data` 1.5.0 (transitively via Shared)
- xUnit in the existing `PrmDashboard.Tests` project

---

## Spec resolutions baked into this plan

The Phase 3d-1 spec (`docs/superpowers/specs/2026-04-22-phase3d1-prm-service-duckdb-design.md`) lists seven open items. This plan locks them:

1. **Percentile algorithm.** DuckDB `quantile_cont` is used in all stat endpoints. The difference from the legacy nearest-rank algorithm is accepted as an upgrade; verification tolerates ±1 minute on percentile-typed response fields.
2. **HhmmSql integration coverage.** Each SQL-emitting helper method gets both a pure unit test (golden string) and one DuckDB integration test that executes the generated expression against literal HHMM values.
3. **`GetSummaryAsync` period-over-period shape.** Two queries in one session (current + previous). Each query returns one row of scalars; shared session amortises connection cost.
4. **Sankey link filtering.** The legacy C# code in `BreakdownService.GetByAgentTypeAsync` has a convoluted `Where` chain that effectively preserves all AgentType→Service and Service→Flight links. The rewrite produces the same links from SQL aggregation directly (no pre-filter). Verification is by snapshot against seeded fixture.
5. **`FilterService` output shape.** The rewrite preserves the existing `FilterOptionsResponse` record (airlines, services, handledBy, flights, minDate, maxDate). SQL uses 4 separate `SELECT DISTINCT` queries + one `SELECT MIN/MAX(service_date)` query, all in one session.
6. **Records endpoint ordering.** Preserved via SQL `ORDER BY` clauses matching the existing `switch sort` expression (`service_date:desc` default).
7. **DI cleanup.** Every reference to `TenantDbContextFactory`, `TenantDbContext`, `HttpClient<TenantDbContextFactory>`, `AddMemoryCache`, `AddHttpContextAccessor` verified via `grep` in Task 12.

---

## Files to create/modify/delete

Create:
- `backend/src/PrmDashboard.PrmService/Sql/HhmmSql.cs`
- `backend/src/PrmDashboard.PrmService/Services/SqlBaseQueryService.cs` (renamed to `BaseQueryService.cs` in Task 12)
- `backend/tests/PrmDashboard.Tests/PrmService/HhmmSqlTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/SqlBaseQueryServiceTests.cs` (renamed to `BaseQueryServiceTests.cs` in Task 12)
- `backend/tests/PrmDashboard.Tests/PrmService/FilterServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/RecordServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/RankingServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/TrendServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/BreakdownServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/KpiServiceTests.cs`
- `backend/tests/PrmDashboard.Tests/PrmService/PerformanceServiceTests.cs`

Modify (rewrite):
- `backend/src/PrmDashboard.PrmService/Services/FilterService.cs`
- `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`
- `backend/src/PrmDashboard.PrmService/Services/RankingService.cs`
- `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`
- `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`
- `backend/src/PrmDashboard.PrmService/Services/KpiService.cs`
- `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`
- `backend/src/PrmDashboard.PrmService/Program.cs`
- `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj`
- `backend/src/PrmDashboard.PrmService/appsettings.json`
- `backend/src/PrmDashboard.PrmService/appsettings.Development.json`

Delete:
- `backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs`
- `backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`
- `backend/src/PrmDashboard.PrmService/Data/TenantNotFoundException.cs`
- `backend/src/PrmDashboard.PrmService/Data/` (empty folder after above removals)
- `backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs` (after rename of `SqlBaseQueryService.cs`)

Controllers, `PrmControllerBase.cs`, `AirportAccessMiddleware.cs`, `ExceptionHandlerMiddleware.cs`, Shared DTOs, Shared Models — all unchanged.

---

## Pre-task: branch state

All Phase-3d-1 work lands on `phase3d1-prm-service` (or equivalent feature branch).

```bash
git log --oneline -3
```

Expected: fast-forward merge target is `fe6e48d` (Phase 3c merged into main).

Run the baseline test suite before starting so you have a green reference:

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 91, Failed: 0`.

---

## Task 1: `HhmmSql` helper + unit and integration tests

Pure, isolated helper. Compiles alongside existing EF-era code; no other file changes.

**Files:**
- Create: `backend/src/PrmDashboard.PrmService/Sql/HhmmSql.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/HhmmSqlTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/HhmmSqlTests.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class HhmmSqlTests
{
    [Fact]
    public void ToMinutes_ProducesExpectedExpression()
    {
        Assert.Equal(
            "(CAST(start_time / 100 AS INTEGER) * 60 + (start_time % 100))",
            HhmmSql.ToMinutes("start_time"));
    }

    [Fact]
    public void ActiveMinutesExpr_UsesCoalesceAndGreatest()
    {
        var expr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");
        Assert.Contains("COALESCE(paused_at, end_time)", expr);
        Assert.Contains("GREATEST(", expr);
        Assert.Contains("start_time", expr);
    }

    [Theory]
    [InlineData(945, 585)]   // 9:45 → 9*60 + 45
    [InlineData(0, 0)]
    [InlineData(2359, 1439)] // 23:59
    [InlineData(237, 157)]   // 2:37
    public async Task ToMinutes_EvaluatesCorrectlyInDuckDb(int hhmm, int expectedMinutes)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT {HhmmSql.ToMinutes(hhmm.ToString())}";
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal((long)expectedMinutes, result);
    }

    [Theory]
    [InlineData(900, null, 1030, 90)]   // no pause: 9:00 → 10:30 = 90 min
    [InlineData(900, 920, 1030, 20)]    // paused at 9:20: 9:00 → 9:20 = 20 min
    [InlineData(1030, null, 900, 0)]    // clock skew: end before start → clamped to 0
    public async Task ActiveMinutesExpr_MatchesLegacyBehaviour(
        int start, int? pausedAt, int end, int expected)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        var pausedLiteral = pausedAt.HasValue ? pausedAt.Value.ToString() : "NULL::INTEGER";
        cmd.CommandText = $"SELECT {HhmmSql.ActiveMinutesExpr(start.ToString(), pausedLiteral, end.ToString())}";
        var result = await cmd.ExecuteScalarAsync();
        Assert.Equal((long)expected, result);
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~HhmmSqlTests --nologo
```

Expected: compilation error (`HhmmSql` type does not exist).

- [ ] **Step 3: Create the `Sql` folder and write `HhmmSql.cs`**

Write `backend/src/PrmDashboard.PrmService/Sql/HhmmSql.cs`:

```csharp
namespace PrmDashboard.PrmService.Sql;

/// <summary>
/// SQL-expression builders for the HHMM integer time-encoding used in
/// <c>prm_services.parquet</c>. Callers interpolate the returned strings
/// into DuckDB queries; values are always column names or integer literals —
/// never user-supplied strings — so no SQL-injection surface.
/// </summary>
public static class HhmmSql
{
    /// <summary>
    /// Expression that converts an HHMM INTEGER expression to total minutes
    /// since midnight. Example: <c>945</c> (9:45) → <c>585</c>.
    /// </summary>
    public static string ToMinutes(string colExpr) =>
        $"(CAST({colExpr} / 100 AS INTEGER) * 60 + ({colExpr} % 100))";

    /// <summary>
    /// Expression for the active-minutes contribution of a single row.
    /// Mirrors <see cref="Shared.Extensions.TimeHelpers.CalculateActiveMinutes"/>:
    /// <c>(COALESCE(paused_at, end_time) - start_time)</c> in minutes,
    /// clamped to ≥ 0 via <c>GREATEST(..., 0)</c>.
    /// </summary>
    public static string ActiveMinutesExpr(string startCol, string pausedAtCol, string endCol) =>
        $"GREATEST({ToMinutes($"COALESCE({pausedAtCol}, {endCol})")} - {ToMinutes(startCol)}, 0)";
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~HhmmSqlTests --nologo
```

Expected: `Passed: 9, Failed: 0` (2 Facts + 4 `ToMinutes` theory rows + 3 `ActiveMinutesExpr` theory rows).

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Sql/HhmmSql.cs \
        backend/tests/PrmDashboard.Tests/PrmService/HhmmSqlTests.cs
git commit -m "feat(prm): add HhmmSql helper for HHMM time arithmetic in DuckDB"
```

---

## Task 2: Register DuckDB infrastructure in `Program.cs`

Additive wiring change: registers `IDuckDbContext`, `TenantParquetPaths`, `DataPathOptions`, `DataPathValidator`. The existing `HttpClient<TenantDbContextFactory>`, `AddMemoryCache`, `AddHttpContextAccessor`, and 7 `AddScoped<...Service>` calls stay in place. All existing tests still pass.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Program.cs`
- Modify: `backend/src/PrmDashboard.PrmService/appsettings.json`
- Modify: `backend/src/PrmDashboard.PrmService/appsettings.Development.json`

- [ ] **Step 1: Add DuckDB DI registrations**

Insert after the `builder.Services.AddAuthorization();` line and before `builder.Services.AddMemoryCache();`:

```csharp
// DuckDB + Parquet data path (Phase 3d-1 migration — replaces TenantService HTTP path).
// The HttpClient+TenantDbContextFactory below will be removed in Task 12 once all services migrate.
builder.Services.Configure<PrmDashboard.Shared.Data.DataPathOptions>(o =>
{
    o.Root = Environment.GetEnvironmentVariable("PRM_DATA_PATH")
             ?? builder.Configuration["DataPath"]
             ?? throw new InvalidOperationException(
                 "Data path required: set PRM_DATA_PATH env var or DataPath in appsettings.");

    o.PoolSize = builder.Configuration.GetValue<int?>("DataPath:PoolSize")
                 ?? PrmDashboard.Shared.Data.DataPathOptions.DefaultPoolSize;

    if (o.PoolSize < PrmDashboard.Shared.Data.DataPathOptions.MinPoolSize
        || o.PoolSize > PrmDashboard.Shared.Data.DataPathOptions.MaxPoolSize)
        throw new InvalidOperationException(
            $"DataPath:PoolSize out of range [{PrmDashboard.Shared.Data.DataPathOptions.MinPoolSize}, "
            + $"{PrmDashboard.Shared.Data.DataPathOptions.MaxPoolSize}]: {o.PoolSize}");
});

builder.Services.AddHostedService<PrmDashboard.Shared.Data.DataPathValidator>();
builder.Services.AddSingleton<PrmDashboard.Shared.Data.IDuckDbContext, PrmDashboard.Shared.Data.DuckDbContext>();
builder.Services.AddSingleton<PrmDashboard.Shared.Data.TenantParquetPaths>();
```

- [ ] **Step 2: Add `DataPath` to `appsettings.json`**

In `backend/src/PrmDashboard.PrmService/appsettings.json`, add the top-level key (keep existing keys untouched):

```json
{
  "DataPath": "/app/data"
}
```

If the file is a JSON object, merge this key into the top level; do not replace the file.

- [ ] **Step 3: Add `DataPath` override to `appsettings.Development.json`**

In `backend/src/PrmDashboard.PrmService/appsettings.Development.json`, add:

```json
{
  "DataPath": "../../../data"
}
```

(Path relative to the PrmService working directory during `dotnet run` from the project folder.)

- [ ] **Step 4: Build to verify nothing broke**

```bash
dotnet build backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Run full test suite — should still be all green**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 91 + 9 = 100, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Program.cs \
        backend/src/PrmDashboard.PrmService/appsettings.json \
        backend/src/PrmDashboard.PrmService/appsettings.Development.json
git commit -m "feat(prm): register DuckDB infrastructure alongside legacy EF path"
```

---

## Task 3: `PrmFixtureBuilder` test helper

Shared async-lifetime builder that materialises a deterministic `prm_services.parquet` in a temp directory for every downstream service test class.

**Files:**
- Create: `backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs`

- [ ] **Step 1: Write the fixture builder**

Write `backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs`:

```csharp
using DuckDB.NET.Data;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

/// <summary>
/// Shared test fixture: writes a deterministic <c>prm_services.parquet</c>
/// under a temp directory so every PrmService integration test uses the same
/// seeded dataset. Covers dedup (id with multiple rows), pause/resume,
/// multi-airport (DEL, BOM, HYD), multiple airlines and service types,
/// no-shows, and a ~30-day date range for period-over-period tests.
/// </summary>
public sealed class PrmFixtureBuilder : IAsyncLifetime
{
    public const string Tenant = "fixture";
    public string RootPath { get; private set; } = "";
    public TenantParquetPaths Paths { get; private set; } = null!;
    public IDuckDbContext Duck { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        RootPath = Path.Combine(Path.GetTempPath(), $"prm-fixture-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(RootPath, Tenant));

        var options = Options.Create(new DataPathOptions { Root = RootPath, PoolSize = 4 });
        Paths = new TenantParquetPaths(options);
        Duck = new DuckDbContext(options);

        await WriteParquet();
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(RootPath, recursive: true); } catch { /* best-effort */ }
        if (Duck is IAsyncDisposable d) return d.DisposeAsync().AsTask();
        return Task.CompletedTask;
    }

    /// <summary>
    /// All seeded rows. The fixture exposes these so tests can assert
    /// hand-computed aggregates match DuckDB's SQL aggregates.
    /// </summary>
    public static IReadOnlyList<Row> SeedRows() => _rows;

    public sealed record Row(
        int RowId, int Id, string Flight, int FlightNumber, string AgentName, string AgentNo,
        string PassengerName, string PrmAgentType, int StartTime, int? PausedAt, int EndTime,
        string Service, string? SeatNumber, string? PosLocation, string? NoShowFlag,
        string LocName, string? Arrival, string Airline, string? Departure, int Requested,
        DateOnly ServiceDate);

    private static readonly IReadOnlyList<Row> _rows = BuildRows();

    private static IReadOnlyList<Row> BuildRows()
    {
        var list = new List<Row>();
        var start = new DateOnly(2026, 3, 1);

        // Id 1: pause/resume at DEL/AI
        list.Add(new(1, 1, "AI101", 101, "Agent One", "A001", "Pax A", "SELF",
            900, 920, 1000, "WCHR", "12A", "Gate-1", "Y", "DEL", "DEL", "AI", "BOM", 1, start));
        list.Add(new(2, 1, "AI101", 101, "Agent One", "A001", "Pax A", "SELF",
            930, null, 1015, "WCHR", "12A", "Gate-1", "Y", "DEL", "DEL", "AI", "BOM", 1, start));

        // Id 2: single row, walk-up (Requested=0), DEL/AI
        list.Add(new(3, 2, "AI102", 102, "Agent Two", "A002", "Pax B", "SELF",
            1000, null, 1045, "WCHC", "14B", "Gate-2", "Y", "DEL", "DEL", "AI", "BOM", 0, start));

        // Id 3: OUTSOURCED agent at BOM/6E, no-show
        list.Add(new(4, 3, "6E201", 201, "Agent Three", "A003", "Pax C", "OUTSOURCED",
            1200, null, 1230, "WCHR", null, null, "N", "BOM", "BOM", "6E", "DEL", 1, start));

        // Id 4-10: bulk rows across 2 more days for percentile/trend testing
        for (var i = 4; i <= 10; i++)
        {
            var day = start.AddDays((i - 4) % 3);
            var isSelf = i % 2 == 0;
            list.Add(new(10 + i, i, $"AI{100 + i}", 100 + i,
                $"Agent {i}", $"A{i:D3}", $"Pax {i}",
                isSelf ? "SELF" : "OUTSOURCED",
                800 + i * 5, null, 830 + i * 5,
                i % 3 == 0 ? "MAAS" : "WCHR",
                null, null, "Y", "DEL", "DEL", i % 4 == 0 ? "UK" : "AI", "BOM", 1, day));
        }

        // Id 11-14: HYD airport, for multi-airport filter tests
        for (var i = 11; i <= 14; i++)
        {
            list.Add(new(20 + i, i, $"6E{i}", 300 + i,
                $"Agent {i}", $"A{i:D3}", $"Pax {i}",
                "OUTSOURCED", 1100, null, 1130,
                "WCHR", null, null, "Y", "HYD", "HYD", "6E", "DEL", 1, start.AddDays(1)));
        }

        // Id 15-20: Previous-period data (before `start`) for period-over-period tests
        for (var i = 15; i <= 20; i++)
        {
            list.Add(new(30 + i, i, "AI999", 999,
                "Agent PrevP", "A999", $"Pax {i}",
                "SELF", 1400, null, 1445,
                "WCHR", null, null, "Y", "DEL", "DEL", "AI", "BOM", 1, start.AddDays(-5 - (i - 15))));
        }

        return list;
    }

    private async Task WriteParquet()
    {
        var target = Paths.TenantPrmServices(Tenant).Replace("'", "''");

        // Use a DuckDB in-memory connection to materialize rows and COPY to Parquet.
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();

        await ExecNonQuery(conn, @"
            CREATE TABLE prm_services (
                row_id INTEGER, id INTEGER, flight VARCHAR, flight_number INTEGER,
                agent_name VARCHAR, agent_no VARCHAR, passenger_name VARCHAR,
                prm_agent_type VARCHAR, start_time INTEGER, paused_at INTEGER,
                end_time INTEGER, service VARCHAR, seat_number VARCHAR,
                pos_location VARCHAR, no_show_flag VARCHAR, loc_name VARCHAR,
                arrival VARCHAR, airline VARCHAR, departure VARCHAR,
                requested INTEGER, service_date DATE
            )");

        await using (var ins = conn.CreateCommand())
        {
            ins.CommandText = @"INSERT INTO prm_services VALUES
                ($row_id, $id, $flight, $flight_number, $agent_name, $agent_no,
                 $passenger_name, $prm_agent_type, $start_time, $paused_at,
                 $end_time, $service, $seat_number, $pos_location, $no_show_flag,
                 $loc_name, $arrival, $airline, $departure, $requested, $service_date)";

            // Parameters reused across rows
            foreach (var r in _rows)
            {
                ins.Parameters.Clear();
                ins.Parameters.Add(new DuckDBParameter("row_id", r.RowId));
                ins.Parameters.Add(new DuckDBParameter("id", r.Id));
                ins.Parameters.Add(new DuckDBParameter("flight", r.Flight));
                ins.Parameters.Add(new DuckDBParameter("flight_number", r.FlightNumber));
                ins.Parameters.Add(new DuckDBParameter("agent_name", r.AgentName));
                ins.Parameters.Add(new DuckDBParameter("agent_no", r.AgentNo));
                ins.Parameters.Add(new DuckDBParameter("passenger_name", r.PassengerName));
                ins.Parameters.Add(new DuckDBParameter("prm_agent_type", r.PrmAgentType));
                ins.Parameters.Add(new DuckDBParameter("start_time", r.StartTime));
                ins.Parameters.Add(new DuckDBParameter("paused_at", (object?)r.PausedAt ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("end_time", r.EndTime));
                ins.Parameters.Add(new DuckDBParameter("service", r.Service));
                ins.Parameters.Add(new DuckDBParameter("seat_number", (object?)r.SeatNumber ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("pos_location", (object?)r.PosLocation ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("no_show_flag", (object?)r.NoShowFlag ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("loc_name", r.LocName));
                ins.Parameters.Add(new DuckDBParameter("arrival", (object?)r.Arrival ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("airline", r.Airline));
                ins.Parameters.Add(new DuckDBParameter("departure", (object?)r.Departure ?? DBNull.Value));
                ins.Parameters.Add(new DuckDBParameter("requested", r.Requested));
                ins.Parameters.Add(new DuckDBParameter("service_date", r.ServiceDate.ToDateTime(TimeOnly.MinValue)));
                await ins.ExecuteNonQueryAsync();
            }
        }

        await ExecNonQuery(conn, $"COPY prm_services TO '{target}' (FORMAT 'parquet')");
    }

    private static async Task ExecNonQuery(DuckDBConnection conn, string sql)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }
}
```

- [ ] **Step 2: Write a smoke test that uses the fixture**

Append to `backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs`:

```csharp
public class PrmFixtureBuilderTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();

    public Task InitializeAsync() => _fx.InitializeAsync();
    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public void Parquet_ExistsOnDisk()
    {
        Assert.True(File.Exists(_fx.Paths.TenantPrmServices(PrmFixtureBuilder.Tenant)));
    }

    [Fact]
    public async Task Parquet_RowCountMatchesSeed()
    {
        await using var s = await _fx.Duck.AcquireAsync();
        await using var cmd = s.Connection.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM '{_fx.Paths.TenantPrmServices(PrmFixtureBuilder.Tenant)}'";
        var n = (long)(await cmd.ExecuteScalarAsync())!;
        Assert.Equal(PrmFixtureBuilder.SeedRows().Count, (int)n);
    }
}
```

- [ ] **Step 3: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~PrmFixtureBuilderTests --nologo
```

Expected: `Passed: 2, Failed: 0`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs
git commit -m "test(prm): add PrmFixtureBuilder for DuckDB integration tests"
```

---

## Task 4: `SqlBaseQueryService` + `BuildWhereClause` pure-unit tests

New parallel base class for the migrated services. Old `BaseQueryService` remains untouched. Services migrate one per task (Tasks 5–11). Task 12 deletes the old and renames the new.

**Files:**
- Create: `backend/src/PrmDashboard.PrmService/Services/SqlBaseQueryService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/SqlBaseQueryServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/SqlBaseQueryServiceTests.cs`:

```csharp
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class SqlBaseQueryServiceTests
{
    [Fact]
    public void BuildWhereClause_SingleAirport_ProducesEqualityAndOneParam()
    {
        var filters = new PrmFilterParams { Airport = "DEL" };
        var (sql, parms) = SqlBaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name = $a0", sql);
        Assert.Single(parms);
        Assert.Equal("a0", parms[0].ParameterName);
        Assert.Equal("DEL", parms[0].Value);
    }

    [Fact]
    public void BuildWhereClause_CsvAirports_ProducesInClause()
    {
        var filters = new PrmFilterParams { Airport = "DEL,BOM" };
        var (sql, parms) = SqlBaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name IN (", sql);
        Assert.Equal(2, parms.Count);
        Assert.Equal(new[] { "DEL", "BOM" }, parms.Select(p => p.Value).ToArray());
    }

    [Fact]
    public void BuildWhereClause_AllFiltersSet_AppendsEachPredicate()
    {
        var filters = new PrmFilterParams
        {
            Airport = "DEL",
            DateFrom = new DateOnly(2026, 3, 1),
            DateTo = new DateOnly(2026, 3, 31),
            Airline = "AI,6E",
            Service = "WCHR",
            HandledBy = "SELF",
            Flight = "AI101",
            AgentNo = "A001"
        };
        var (sql, parms) = SqlBaseQueryService.BuildWhereClauseForTest(filters);

        Assert.Contains("loc_name = $a0", sql);
        Assert.Contains("service_date >= $df", sql);
        Assert.Contains("service_date <= $dt", sql);
        Assert.Contains("airline IN (", sql);
        Assert.Contains("service IN (", sql);
        Assert.Contains("prm_agent_type IN (", sql);
        Assert.Contains("flight = $f", sql);
        Assert.Contains("agent_no = $ag", sql);

        // 1 airport + 2 dates + 2 airlines + 1 service + 1 handledBy + flight + agentNo = 9
        Assert.Equal(9, parms.Count);
    }

    [Fact]
    public void GetPrevPeriodStart_SevenDayRange_ReturnsSevenDaysEarlier()
    {
        var from = new DateOnly(2026, 3, 8);
        var to = new DateOnly(2026, 3, 14);
        Assert.Equal(new DateOnly(2026, 3, 1),
            SqlBaseQueryService.GetPrevPeriodStartForTest(from, to));
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~SqlBaseQueryServiceTests --nologo
```

Expected: compilation error (`SqlBaseQueryService` does not exist).

- [ ] **Step 3: Write `SqlBaseQueryService.cs`**

Write `backend/src/PrmDashboard.PrmService/Services/SqlBaseQueryService.cs`:

```csharp
using System.Text;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

/// <summary>
/// Abstract base for PRM query services after the DuckDB migration.
/// Holds the DuckDB session factory and parquet-path helper, and exposes a
/// pure static <see cref="BuildWhereClause"/> that turns
/// <see cref="PrmFilterParams"/> into a parameterised SQL WHERE fragment.
///
/// The airport filter is required (middleware enforces non-empty
/// <c>?airport=...</c> and validates against the JWT claim); other filters
/// are optional and omitted from the fragment when absent.
/// </summary>
public abstract class SqlBaseQueryService
{
    protected readonly IDuckDbContext _duck;
    protected readonly TenantParquetPaths _paths;

    protected SqlBaseQueryService(IDuckDbContext duck, TenantParquetPaths paths)
    {
        _duck = duck;
        _paths = paths;
    }

    protected static (string Sql, IReadOnlyList<DuckDBParameter> Parameters) BuildWhereClause(
        PrmFilterParams filters)
    {
        var sb = new StringBuilder();
        var parms = new List<DuckDBParameter>();

        var airports = filters.AirportList;
        if (airports is { Length: > 0 })
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            sb.Append("loc_name IN (").Append(string.Join(",", names)).Append(')');
            for (var i = 0; i < airports.Length; i++)
                parms.Add(new DuckDBParameter($"a{i}", airports[i]));
        }
        else
        {
            sb.Append("loc_name = $a0");
            parms.Add(new DuckDBParameter("a0", filters.Airport ?? ""));
        }

        if (filters.DateFrom.HasValue)
        {
            sb.Append(" AND service_date >= $df");
            parms.Add(new DuckDBParameter("df", filters.DateFrom.Value.ToDateTime(TimeOnly.MinValue)));
        }
        if (filters.DateTo.HasValue)
        {
            sb.Append(" AND service_date <= $dt");
            parms.Add(new DuckDBParameter("dt", filters.DateTo.Value.ToDateTime(TimeOnly.MinValue)));
        }

        AppendInClause(sb, parms, "airline",        filters.AirlineList,   "al");
        AppendInClause(sb, parms, "service",        filters.ServiceList,   "sv");
        AppendInClause(sb, parms, "prm_agent_type", filters.HandledByList, "hb");

        if (!string.IsNullOrEmpty(filters.Flight))
        {
            sb.Append(" AND flight = $f");
            parms.Add(new DuckDBParameter("f", filters.Flight));
        }
        if (!string.IsNullOrEmpty(filters.AgentNo))
        {
            sb.Append(" AND agent_no = $ag");
            parms.Add(new DuckDBParameter("ag", filters.AgentNo));
        }

        return (sb.ToString(), parms);
    }

    private static void AppendInClause(
        StringBuilder sb, List<DuckDBParameter> parms,
        string col, string[]? values, string prefix)
    {
        if (values is not { Length: > 0 }) return;
        var names = values.Select((_, i) => $"${prefix}{i}").ToArray();
        sb.Append($" AND {col} IN (").Append(string.Join(",", names)).Append(')');
        for (var i = 0; i < values.Length; i++)
            parms.Add(new DuckDBParameter($"{prefix}{i}", values[i]));
    }

    protected static DateOnly GetPrevPeriodStart(DateOnly from, DateOnly to)
    {
        var days = to.DayNumber - from.DayNumber + 1;
        return from.AddDays(-days);
    }

    /// <summary>Escapes single quotes in filesystem path literals.</summary>
    protected static string EscapePath(string path) => path.Replace("'", "''");

    // --- test shims (internal protected not visible to xUnit project, so expose as internal) ---

    internal static (string Sql, IReadOnlyList<DuckDBParameter> Parameters) BuildWhereClauseForTest(
        PrmFilterParams filters) => BuildWhereClause(filters);

    internal static DateOnly GetPrevPeriodStartForTest(DateOnly from, DateOnly to) =>
        GetPrevPeriodStart(from, to);
}
```

- [ ] **Step 4: Expose internals to the test project**

Check `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj` for an existing `<InternalsVisibleTo Include="PrmDashboard.Tests" />` line. If absent, add:

```xml
<ItemGroup>
  <InternalsVisibleTo Include="PrmDashboard.Tests" />
</ItemGroup>
```

- [ ] **Step 5: Run tests to verify pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~SqlBaseQueryServiceTests --nologo
```

Expected: `Passed: 4, Failed: 0`.

- [ ] **Step 6: Run full test suite — everything still green**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 106, Failed: 0` (91 baseline + 9 HhmmSql + 2 PrmFixtureBuilder + 4 SqlBaseQueryService).

- [ ] **Step 7: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/SqlBaseQueryService.cs \
        backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj \
        backend/tests/PrmDashboard.Tests/PrmService/SqlBaseQueryServiceTests.cs
git commit -m "feat(prm): add SqlBaseQueryService with parameterised WHERE builder"
```

---

## Task 5: Rewrite `FilterService`

First service migration. Replaces EF calls with one DuckDB session that runs 5 queries (4 × `SELECT DISTINCT` + 1 × `MIN/MAX`).

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/FilterService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/FilterServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/FilterServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class FilterServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private FilterService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new FilterService(_fx.Duck, _fx.Paths, NullLogger<FilterService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetOptionsAsync_SingleAirport_ReturnsAllDimensions()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "DEL");

        Assert.Contains("AI", r.Airlines);
        Assert.Contains("WCHR", r.Services);
        Assert.Contains("SELF", r.HandledBy);
        Assert.NotEmpty(r.Flights);
        Assert.NotNull(r.MinDate);
        Assert.NotNull(r.MaxDate);
        // Fixture has rows predating start (Id 15-20) at DEL
        Assert.True(r.MinDate < r.MaxDate);
    }

    [Fact]
    public async Task GetOptionsAsync_MultiAirport_UnionsDistinctValues()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "DEL,BOM");
        Assert.Contains("AI", r.Airlines);
        Assert.Contains("6E", r.Airlines);
    }

    [Fact]
    public async Task GetOptionsAsync_UnknownAirport_ReturnsEmpty()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "ZZZ");
        Assert.Empty(r.Airlines);
        Assert.Null(r.MinDate);
        Assert.Null(r.MaxDate);
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~FilterServiceTests --nologo
```

Expected: compile fail (ctor signature mismatch).

- [ ] **Step 3: Rewrite `FilterService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/FilterService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class FilterService : SqlBaseQueryService
{
    private readonly ILogger<FilterService> _logger;

    public FilterService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<FilterService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<FilterOptionsResponse> GetOptionsAsync(
        string tenantSlug, string airport, CancellationToken ct = default)
    {
        var airports = airport.Split(
            ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // Build shared WHERE fragment + params for airport filter
        string where;
        List<DuckDBParameter> baseParms;
        if (airports.Length > 0)
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            where = $"loc_name IN ({string.Join(",", names)})";
            baseParms = airports.Select((a, i) => new DuckDBParameter($"a{i}", a)).ToList();
        }
        else
        {
            where = "loc_name = $a0";
            baseParms = new List<DuckDBParameter> { new("a0", airport) };
        }

        var airlines  = await DistinctAsync(conn, path, "airline",        where, baseParms, ct);
        var services  = await DistinctAsync(conn, path, "service",        where, baseParms, ct);
        var handledBy = await DistinctAsync(conn, path, "prm_agent_type", where, baseParms, ct);
        var flights   = await DistinctAsync(conn, path, "flight",         where, baseParms, ct);

        (DateOnly? minDate, DateOnly? maxDate) = await MinMaxDateAsync(conn, path, where, baseParms, ct);

        _logger.LogInformation(
            "Filter options for {Slug}/{Airport}: {Airlines} airlines, {Services} services",
            tenantSlug, airport, airlines.Count, services.Count);

        return new FilterOptionsResponse(airlines, services, handledBy, flights, minDate, maxDate);
    }

    private static async Task<List<string>> DistinctAsync(
        DuckDBConnection conn, string path, string col, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT DISTINCT {col} FROM '{path}' WHERE {where} AND {col} IS NOT NULL ORDER BY 1";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var list = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            list.Add(reader.GetString(0));
        return list;
    }

    private static async Task<(DateOnly?, DateOnly?)> MinMaxDateAsync(
        DuckDBConnection conn, string path, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT MIN(service_date), MAX(service_date) FROM '{path}' WHERE {where}";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct) || reader.IsDBNull(0)) return (null, null);
        var min = DateOnly.FromDateTime(reader.GetDateTime(0));
        var max = DateOnly.FromDateTime(reader.GetDateTime(1));
        return (min, max);
    }
}
```

- [ ] **Step 4: Run the FilterService tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~FilterServiceTests --nologo
```

Expected: `Passed: 3, Failed: 0`.

- [ ] **Step 5: Run the full suite — other services still use old ctor; must stay green**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 109, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/FilterService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/FilterServiceTests.cs
git commit -m "feat(prm): migrate FilterService to DuckDB + Parquet"
```

---

## Task 6: Rewrite `RecordService`

Two endpoints: paginated records (with dedup + sort + pagination) and segment detail (no dedup).

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/RecordServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/RecordServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class RecordServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private RecordService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new RecordService(_fx.Duck, _fx.Paths, NullLogger<RecordService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetRecordsAsync_Dedup_ReturnsFirstRowPerId()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 1, pageSize: 100);

        // No duplicate ids
        var ids = r.Items.Select(i => i.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());

        // Id 1 → first row (row_id=1, start_time=900), not the row_id=2 row
        var one = r.Items.Single(i => i.Id == 1);
        Assert.Equal(1, one.RowId);
        Assert.Equal(900, one.StartTime);
    }

    [Fact]
    public async Task GetRecordsAsync_Pagination_SplitsResults()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var p1 = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 1, pageSize: 3);
        var p2 = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 2, pageSize: 3);

        Assert.Equal(3, p1.Items.Count);
        Assert.True(p2.Items.Count > 0);
        Assert.Empty(p1.Items.Select(i => i.Id).Intersect(p2.Items.Select(i => i.Id)));
        Assert.Equal(p1.TotalCount, p2.TotalCount);
    }

    [Fact]
    public async Task GetSegmentsAsync_PausedService_ReturnsBothSegments()
    {
        var segs = await _svc.GetSegmentsAsync(PrmFixtureBuilder.Tenant, prmId: 1, airport: "DEL");
        Assert.Equal(2, segs.Count);
        Assert.Equal(1, segs[0].RowId);
        Assert.Equal(2, segs[1].RowId);
        Assert.Equal(20, segs[0].ActiveMinutes); // 9:00 → 9:20 (paused)
        Assert.Equal(45, segs[1].ActiveMinutes); // 9:30 → 10:15
    }

    [Fact]
    public async Task GetSegmentsAsync_UnknownId_ReturnsEmpty()
    {
        var segs = await _svc.GetSegmentsAsync(PrmFixtureBuilder.Tenant, prmId: 9999, airport: "DEL");
        Assert.Empty(segs);
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~RecordServiceTests --nologo
```

Expected: compile fail (ctor signature mismatch).

- [ ] **Step 3: Rewrite `RecordService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class RecordService : SqlBaseQueryService
{
    private readonly ILogger<RecordService> _logger;

    public RecordService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<RecordService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<PaginatedResponse<PrmRecordDto>> GetRecordsAsync(
        string tenantSlug, PrmFilterParams filters,
        int page = 1, int pageSize = 20, string sort = "service_date:desc",
        CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var orderBy = sort switch
        {
            "start_time:asc"   => "start_time ASC",
            "start_time:desc"  => "start_time DESC",
            "service_date:asc" => "service_date ASC, start_time ASC",
            _                  => "service_date DESC, start_time DESC"
        };

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // Total count (on deduped set)
        await using (var countCmd = conn.CreateCommand())
        {
            countCmd.CommandText = $@"
                SELECT COUNT(*) FROM (
                    SELECT id FROM '{path}' WHERE {where}
                    GROUP BY id
                )";
            foreach (var p in parms) countCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
            var total = (long)(await countCmd.ExecuteScalarAsync(ct))!;

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $@"
                WITH canonical AS (
                    SELECT id, MIN(row_id) AS row_id FROM '{path}'
                    WHERE {where}
                    GROUP BY id
                )
                SELECT t.row_id, t.id, t.flight, t.agent_name, t.passenger_name,
                       t.prm_agent_type, t.start_time, t.paused_at, t.end_time,
                       t.service, t.seat_number, t.pos_location, t.no_show_flag,
                       t.loc_name, t.arrival, t.airline, t.departure, t.requested,
                       t.service_date
                FROM '{path}' t
                INNER JOIN canonical c ON c.row_id = t.row_id
                ORDER BY t.{orderBy}
                LIMIT $limit OFFSET $offset";
            foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
            cmd.Parameters.Add(new DuckDBParameter("limit", pageSize));
            cmd.Parameters.Add(new DuckDBParameter("offset", (page - 1) * pageSize));

            var items = new List<PrmRecordDto>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                items.Add(new PrmRecordDto(
                    RowId: reader.GetInt32(0),
                    Id: reader.GetInt32(1),
                    Flight: reader.GetString(2),
                    AgentName: reader.IsDBNull(3) ? null : reader.GetString(3),
                    PassengerName: reader.GetString(4),
                    PrmAgentType: reader.GetString(5),
                    StartTime: reader.GetInt32(6),
                    PausedAt: reader.IsDBNull(7) ? null : reader.GetInt32(7),
                    EndTime: reader.GetInt32(8),
                    Service: reader.GetString(9),
                    SeatNumber: reader.IsDBNull(10) ? null : reader.GetString(10),
                    PosLocation: reader.IsDBNull(11) ? null : reader.GetString(11),
                    NoShowFlag: reader.IsDBNull(12) ? null : reader.GetString(12),
                    LocName: reader.GetString(13),
                    Arrival: reader.IsDBNull(14) ? null : reader.GetString(14),
                    Airline: reader.GetString(15),
                    Departure: reader.IsDBNull(16) ? null : reader.GetString(16),
                    Requested: reader.GetInt32(17),
                    ServiceDate: DateOnly.FromDateTime(reader.GetDateTime(18))));
            }

            var totalPages = total == 0 ? 0 : (int)Math.Ceiling((double)total / pageSize);
            _logger.LogInformation(
                "Records for {Slug}/{Airport}: page {Page}/{TotalPages}, {Count} items",
                tenantSlug, filters.Airport, page, totalPages, items.Count);

            return new PaginatedResponse<PrmRecordDto>(items, (int)total, page, pageSize, totalPages);
        }
    }

    public async Task<List<PrmSegmentDto>> GetSegmentsAsync(
        string tenantSlug, int prmId, string airport, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var airports = airport.Split(
            ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        string where;
        List<DuckDBParameter> parms;
        if (airports.Length > 0)
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            where = $"id = $pid AND loc_name IN ({string.Join(",", names)})";
            parms = airports.Select((a, i) => new DuckDBParameter($"a{i}", a)).ToList();
            parms.Add(new DuckDBParameter("pid", prmId));
        }
        else
        {
            where = "id = $pid AND loc_name = $a0";
            parms = new List<DuckDBParameter>
            {
                new("a0", airport), new("pid", prmId)
            };
        }

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT row_id, start_time, paused_at, end_time,
                   {HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time")} AS active_min
            FROM '{path}'
            WHERE {where}
            ORDER BY row_id";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var segments = new List<PrmSegmentDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            segments.Add(new PrmSegmentDto(
                RowId: reader.GetInt32(0),
                StartTime: reader.GetInt32(1),
                PausedAt: reader.IsDBNull(2) ? null : reader.GetInt32(2),
                EndTime: reader.GetInt32(3),
                ActiveMinutes: Convert.ToDouble(reader.GetValue(4))));
        }

        _logger.LogInformation("Segments for {Slug}/{Airport}/PRM#{Id}: {Count} segments",
            tenantSlug, airport, prmId, segments.Count);
        return segments;
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~RecordServiceTests --nologo
```

Expected: `Passed: 4, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 113, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/RecordService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/RecordServiceTests.cs
git commit -m "feat(prm): migrate RecordService to DuckDB + Parquet"
```

---

## Task 7: Rewrite `RankingService`

Four endpoints: airlines, flights, services (all top-N by distinct count), plus agents (rich per-agent aggregation).

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/RankingService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/RankingServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/RankingServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class RankingServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private RankingService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new RankingService(_fx.Duck, _fx.Paths, NullLogger<RankingService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetTopAirlinesAsync_SortedDescendingWithPercentage()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopAirlinesAsync(PrmFixtureBuilder.Tenant, f, limit: 10);

        Assert.NotEmpty(r.Items);
        // Descending count
        for (var i = 1; i < r.Items.Count; i++)
            Assert.True(r.Items[i - 1].Count >= r.Items[i].Count);
        Assert.True(r.Items.All(x => x.Percentage >= 0 && x.Percentage <= 100));
    }

    [Fact]
    public async Task GetTopServicesAsync_NoLimit_ReturnsAllServiceTypes()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopServicesAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Contains(r.Items, i => i.Label == "WCHR");
    }

    [Fact]
    public async Task GetTopFlightsAsync_SeparatesRequestedAndServiced()
    {
        var f = new PrmFilterParams { Airport = "BOM" };
        var r = await _svc.GetTopFlightsAsync(PrmFixtureBuilder.Tenant, f, limit: 10);
        // Id 3 at BOM is a no-show, so requested=1, serviced=0 for 6E201
        var item = r.Items.Single(i => i.Label == "6E201");
        Assert.Equal(1, item.RequestedCount);
        Assert.Equal(0, item.ServicedCount);
    }

    [Fact]
    public async Task GetTopAgentsAsync_ReturnsPerAgentMetrics()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopAgentsAsync(PrmFixtureBuilder.Tenant, f, limit: 5);
        Assert.NotEmpty(r.Items);
        Assert.All(r.Items, a => Assert.True(a.PrmCount > 0));
        Assert.Equal(1, r.Items[0].Rank);
    }
}
```

- [ ] **Step 2: Confirm compile failure**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~RankingServiceTests --nologo
```

Expected: compile fail.

- [ ] **Step 3: Rewrite `RankingService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/RankingService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class RankingService : SqlBaseQueryService
{
    private readonly ILogger<RankingService> _logger;

    public RankingService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<RankingService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<RankingsResponse> GetTopAirlinesAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var items = await GroupCountTopAsync(tenantSlug, filters, "airline", limit, ct);
        _logger.LogInformation("Top airlines for {Slug}/{Airport}: {Count}",
            tenantSlug, filters.Airport, items.Count);
        return new RankingsResponse(items);
    }

    public async Task<RankingsResponse> GetTopServicesAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var items = await GroupCountTopAsync(tenantSlug, filters, "service", limit: null, ct);
        _logger.LogInformation("Service rankings for {Slug}/{Airport}: {Count}",
            tenantSlug, filters.Airport, items.Count);
        return new RankingsResponse(items);
    }

    public async Task<FlightRankingsResponse> GetTopFlightsAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            ),
            totals AS (
                SELECT SUM(CASE WHEN no_show_flag != 'N' OR no_show_flag IS NULL THEN 1 ELSE 0 END) AS total_serviced
                FROM deduped
            )
            SELECT d.flight,
                   SUM(CASE WHEN d.no_show_flag != 'N' OR d.no_show_flag IS NULL THEN 1 ELSE 0 END) AS serviced,
                   COUNT(*) AS requested,
                   CASE WHEN (SELECT total_serviced FROM totals) > 0
                        THEN ROUND(100.0 * SUM(CASE WHEN d.no_show_flag != 'N' OR d.no_show_flag IS NULL THEN 1 ELSE 0 END)
                                       / (SELECT total_serviced FROM totals), 2)
                        ELSE 0.0 END AS pct
            FROM deduped d
            GROUP BY d.flight
            ORDER BY serviced DESC
            LIMIT $limit";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        cmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var items = new List<FlightRankingItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new FlightRankingItem(
                Flight: reader.GetString(0),
                ServicedCount: Convert.ToInt32(reader.GetValue(1)),
                RequestedCount: Convert.ToInt32(reader.GetValue(2)),
                Percentage: Convert.ToDouble(reader.GetValue(3))));
        }

        _logger.LogInformation("Top flights for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new FlightRankingsResponse(items);
    }

    public async Task<AgentRankingsResponse> GetTopAgentsAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH filtered AS (
                SELECT * FROM '{path}' WHERE {where} AND agent_no IS NOT NULL AND agent_no != ''
            ),
            deduped AS (
                SELECT agent_no, id, MIN(row_id) AS min_row_id,
                       SUM({activeExpr}) AS duration
                FROM filtered
                GROUP BY agent_no, id
            ),
            canonical AS (
                SELECT f.agent_no, f.id, f.airline, f.service, f.agent_name, f.service_date, d.duration
                FROM filtered f
                INNER JOIN deduped d ON d.min_row_id = f.row_id
            ),
            per_agent AS (
                SELECT agent_no,
                       COUNT(*) AS prm_count,
                       AVG(duration) AS avg_duration,
                       COUNT(DISTINCT service_date) AS days_active,
                       ANY_VALUE(agent_name) AS agent_name
                FROM canonical
                GROUP BY agent_no
            ),
            top_service AS (
                SELECT agent_no, service AS top_service, cnt AS top_service_count
                FROM (
                    SELECT agent_no, service, COUNT(*) AS cnt,
                           ROW_NUMBER() OVER (PARTITION BY agent_no ORDER BY COUNT(*) DESC, service) AS rn
                    FROM canonical GROUP BY agent_no, service
                ) WHERE rn = 1
            ),
            top_airline AS (
                SELECT agent_no, airline AS top_airline
                FROM (
                    SELECT agent_no, airline, COUNT(*) AS cnt,
                           ROW_NUMBER() OVER (PARTITION BY agent_no ORDER BY COUNT(*) DESC, airline) AS rn
                    FROM canonical GROUP BY agent_no, airline
                ) WHERE rn = 1
            )
            SELECT p.agent_no, p.agent_name, p.prm_count,
                   ROUND(p.avg_duration, 2) AS avg_duration,
                   COALESCE(ts.top_service, '') AS top_service,
                   COALESCE(ts.top_service_count, 0) AS top_service_count,
                   COALESCE(ta.top_airline, '') AS top_airline,
                   p.days_active,
                   CASE WHEN p.days_active > 0 THEN ROUND(p.prm_count * 1.0 / p.days_active, 2) ELSE 0 END AS avg_per_day
            FROM per_agent p
            LEFT JOIN top_service ts ON ts.agent_no = p.agent_no
            LEFT JOIN top_airline ta ON ta.agent_no = p.agent_no
            ORDER BY p.prm_count DESC
            LIMIT $limit";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        cmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var items = new List<AgentRankingItem>();
        var rank = 1;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new AgentRankingItem(
                Rank: rank++,
                AgentNo: reader.GetString(0),
                AgentName: reader.IsDBNull(1) ? "" : reader.GetString(1),
                PrmCount: Convert.ToInt32(reader.GetValue(2)),
                AvgDurationMinutes: Convert.ToDouble(reader.GetValue(3)),
                TopService: reader.GetString(4),
                TopServiceCount: Convert.ToInt32(reader.GetValue(5)),
                TopAirline: reader.GetString(6),
                DaysActive: Convert.ToInt32(reader.GetValue(7)),
                AvgPerDay: Convert.ToDouble(reader.GetValue(8))));
        }

        _logger.LogInformation("Agent rankings for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new AgentRankingsResponse(items);
    }

    private async Task<List<RankingItem>> GroupCountTopAsync(
        string tenantSlug, PrmFilterParams filters, string col, int? limit, CancellationToken ct)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT d.{col} AS label,
                   COUNT(*) AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped d
            GROUP BY d.{col}
            ORDER BY cnt DESC
            {(limit.HasValue ? "LIMIT $limit" : "")}";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        if (limit.HasValue) cmd.Parameters.Add(new DuckDBParameter("limit", limit.Value));

        var items = new List<RankingItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new RankingItem(
                Label: reader.GetString(0),
                Count: Convert.ToInt32(reader.GetValue(1)),
                Percentage: Convert.ToDouble(reader.GetValue(2))));
        }
        return items;
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~RankingServiceTests --nologo
```

Expected: `Passed: 4, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 117, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/RankingService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/RankingServiceTests.cs
git commit -m "feat(prm): migrate RankingService to DuckDB + Parquet"
```

---

## Task 8: Rewrite `TrendService`

Four endpoints: daily count, monthly count, hourly heatmap (7×24), requested-vs-provided daily.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/TrendServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/TrendServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class TrendServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private TrendService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new TrendService(_fx.Duck, _fx.Paths, NullLogger<TrendService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetDailyAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDailyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.Dates.Count, r.Values.Count);
        Assert.True(r.Average >= 0);
    }

    [Fact]
    public async Task GetMonthlyAsync_UsesYYYYMMLabels()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetMonthlyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.All(r.Months, m => Assert.Matches(@"^\d{4}-\d{2}$", m));
    }

    [Fact]
    public async Task GetHourlyAsync_ReturnsSevenByTwentyFourGrid()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetHourlyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" }, r.Days.ToArray());
        Assert.Equal(24, r.Hours.Count);
        Assert.Equal(7, r.Values.Count);
        Assert.All(r.Values, row => Assert.Equal(24, row.Count));
    }

    [Fact]
    public async Task GetRequestedVsProvidedAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRequestedVsProvidedAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.Dates.Count, r.Provided.Count);
        Assert.Equal(r.Dates.Count, r.Requested.Count);
    }
}
```

- [ ] **Step 2: Confirm fail**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~TrendServiceTests --nologo
```

Expected: compile fail.

- [ ] **Step 3: Rewrite `TrendService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class TrendService : SqlBaseQueryService
{
    private readonly ILogger<TrendService> _logger;

    public TrendService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<TrendService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<DailyTrendResponse> GetDailyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT service_date, COUNT(DISTINCT id) AS cnt
            FROM '{path}'
            WHERE {where}
            GROUP BY service_date
            ORDER BY service_date";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var dates = new List<string>();
        var values = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            dates.Add(DateOnly.FromDateTime(reader.GetDateTime(0)).ToString("yyyy-MM-dd"));
            values.Add(Convert.ToInt32(reader.GetValue(1)));
        }

        double average = values.Count > 0 ? Math.Round(values.Average(), 2) : 0;
        _logger.LogInformation("Daily trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, dates.Count);
        return new DailyTrendResponse(dates, values, average);
    }

    public async Task<MonthlyTrendResponse> GetMonthlyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT strftime(service_date, '%Y-%m') AS ym, COUNT(DISTINCT id) AS cnt
            FROM '{path}'
            WHERE {where}
            GROUP BY ym
            ORDER BY ym";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var months = new List<string>();
        var values = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            months.Add(reader.GetString(0));
            values.Add(Convert.ToInt32(reader.GetValue(1)));
        }

        _logger.LogInformation("Monthly trend for {Slug}/{Airport}: {Months} months",
            tenantSlug, filters.Airport, months.Count);
        return new MonthlyTrendResponse(months, values);
    }

    public async Task<HourlyHeatmapResponse> GetHourlyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        // DuckDB dayofweek: Sun=0..Sat=6. Map to Mon=0..Sun=6 via ((dow + 6) % 7).
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT ((CAST(strftime(service_date, '%w') AS INTEGER) + 6) % 7) AS dow,
                   CAST(start_time / 100 AS INTEGER) AS hr,
                   COUNT(*) AS cnt
            FROM deduped
            WHERE start_time / 100 BETWEEN 0 AND 23
            GROUP BY dow, hr";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var values = new List<List<int>>();
        for (var d = 0; d < 7; d++) values.Add(Enumerable.Repeat(0, 24).ToList());

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var dow = Convert.ToInt32(reader.GetValue(0));
            var hr  = Convert.ToInt32(reader.GetValue(1));
            var cnt = Convert.ToInt32(reader.GetValue(2));
            if (dow is >= 0 and < 7 && hr is >= 0 and < 24) values[dow][hr] = cnt;
        }

        _logger.LogInformation("Hourly heatmap for {Slug}/{Airport} built", tenantSlug, filters.Airport);
        return new HourlyHeatmapResponse(
            new List<string> { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" },
            Enumerable.Range(0, 24).ToList(),
            values);
    }

    public async Task<RequestedVsProvidedTrendResponse> GetRequestedVsProvidedAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT service_date, COUNT(*) AS provided, SUM(requested) AS requested
            FROM deduped
            GROUP BY service_date
            ORDER BY service_date";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var dates = new List<string>();
        var provided = new List<int>();
        var requested = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            dates.Add(DateOnly.FromDateTime(reader.GetDateTime(0)).ToString("yyyy-MM-dd"));
            provided.Add(Convert.ToInt32(reader.GetValue(1)));
            requested.Add(Convert.ToInt32(reader.GetValue(2)));
        }

        _logger.LogInformation("Requested vs provided trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, dates.Count);
        return new RequestedVsProvidedTrendResponse(dates, provided, requested);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~TrendServiceTests --nologo
```

Expected: `Passed: 4, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 121, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/TrendService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/TrendServiceTests.cs
git commit -m "feat(prm): migrate TrendService to DuckDB + Parquet"
```

---

## Task 9: Rewrite `BreakdownService`

Six endpoints: by-service-type matrix (months × types), by-agent-type sankey, by-airline, by-location, by-route, agent-service matrix.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/BreakdownServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/BreakdownServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class BreakdownServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private BreakdownService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new BreakdownService(_fx.Duck, _fx.Paths, NullLogger<BreakdownService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetByAirlineAsync_Percentages_SumToApprox100()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByAirlineAsync(PrmFixtureBuilder.Tenant, f);
        Assert.InRange(r.Items.Sum(x => x.Percentage), 99.0, 101.0);
    }

    [Fact]
    public async Task GetByRouteAsync_OnlyRowsWithDepAndArr()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByRouteAsync(PrmFixtureBuilder.Tenant, f, limit: 10);
        Assert.All(r.Items, i =>
        {
            Assert.False(string.IsNullOrEmpty(i.Departure));
            Assert.False(string.IsNullOrEmpty(i.Arrival));
        });
    }

    [Fact]
    public async Task GetByServiceTypeAsync_ReturnsMatrixRows()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByServiceTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.NotEmpty(r.ServiceTypes);
        Assert.NotEmpty(r.Rows);
    }

    [Fact]
    public async Task GetByAgentTypeAsync_ProducesSankey()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByAgentTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.NotEmpty(r.Nodes);
        Assert.NotEmpty(r.Links);
    }

    [Fact]
    public async Task GetByLocationAsync_SkipsNullOrEmpty()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByLocationAsync(PrmFixtureBuilder.Tenant, f);
        Assert.All(r.Items, i => Assert.False(string.IsNullOrEmpty(i.Label)));
    }

    [Fact]
    public async Task GetAgentServiceMatrixAsync_LimitEnforced()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetAgentServiceMatrixAsync(PrmFixtureBuilder.Tenant, f, limit: 3);
        Assert.True(r.Agents.Count <= 3);
    }
}
```

- [ ] **Step 2: Confirm fail**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~BreakdownServiceTests --nologo
```

Expected: compile fail.

- [ ] **Step 3: Rewrite `BreakdownService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class BreakdownService : SqlBaseQueryService
{
    private readonly ILogger<BreakdownService> _logger;

    public BreakdownService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<BreakdownService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<BreakdownResponse> GetByAirlineAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var items = await GroupCountAsync(tenantSlug, filters, "airline", skipNull: false, ct);
        _logger.LogInformation("Airline breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new BreakdownResponse(items);
    }

    public async Task<BreakdownResponse> GetByLocationAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var items = await GroupCountAsync(tenantSlug, filters, "pos_location", skipNull: true, ct);
        _logger.LogInformation("Location breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new BreakdownResponse(items);
    }

    public async Task<RouteBreakdownResponse> GetByRouteAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
                    AND departure IS NOT NULL AND departure != ''
                    AND arrival   IS NOT NULL AND arrival   != ''
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT departure, arrival, COUNT(*) AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped
            GROUP BY departure, arrival
            ORDER BY cnt DESC
            LIMIT $limit";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        cmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var items = new List<RouteItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new RouteItem(
                Departure: reader.GetString(0),
                Arrival: reader.GetString(1),
                Count: Convert.ToInt32(reader.GetValue(2)),
                Percentage: Convert.ToDouble(reader.GetValue(3))));
        }
        _logger.LogInformation("Route breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new RouteBreakdownResponse(items);
    }

    public async Task<ServiceTypeMatrixResponse> GetByServiceTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // 1. Distinct service types
        await using var typesCmd = conn.CreateCommand();
        typesCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT DISTINCT service FROM deduped ORDER BY service";
        foreach (var p in parms) typesCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var types = new List<string>();
        await using (var r = await typesCmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) types.Add(r.GetString(0));

        // 2. Matrix: month × service → count
        await using var matCmd = conn.CreateCommand();
        matCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT strftime(service_date, '%Y-%m') AS ym, service, COUNT(*) AS cnt
            FROM deduped
            GROUP BY ym, service
            ORDER BY ym";
        foreach (var p in parms) matCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var byMonth = new Dictionary<string, Dictionary<string, int>>();
        await using (var r = await matCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var ym = r.GetString(0);
                var sv = r.GetString(1);
                var cnt = Convert.ToInt32(r.GetValue(2));
                if (!byMonth.TryGetValue(ym, out var dict))
                    byMonth[ym] = dict = new Dictionary<string, int>();
                dict[sv] = cnt;
            }
        }

        var rows = byMonth.OrderBy(kv => kv.Key).Select(kv =>
        {
            var counts = new Dictionary<string, int>();
            foreach (var t in types) counts[t] = kv.Value.GetValueOrDefault(t);
            var total = counts.Values.Sum();
            return new ServiceTypeMatrixRow(kv.Key, counts, total);
        }).ToList();

        _logger.LogInformation("Service type matrix for {Slug}/{Airport}: {Types}×{Months}",
            tenantSlug, filters.Airport, types.Count, rows.Count);
        return new ServiceTypeMatrixResponse(types, rows);
    }

    public async Task<SankeyResponse> GetByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT prm_agent_type, service, flight FROM deduped";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var nodes = new Dictionary<string, int>();
        var links = new Dictionary<(string, string), int>();

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var at = reader.GetString(0);
            var sv = reader.GetString(1);
            var fl = reader.GetString(2);
            nodes[at] = nodes.GetValueOrDefault(at) + 1;
            nodes[sv] = nodes.GetValueOrDefault(sv) + 1;
            nodes[fl] = nodes.GetValueOrDefault(fl) + 1;
            var k1 = (at, sv);
            var k2 = (sv, fl);
            links[k1] = links.GetValueOrDefault(k1) + 1;
            links[k2] = links.GetValueOrDefault(k2) + 1;
        }

        var sankeyNodes = nodes.Select(kv => new SankeyNode(kv.Key, kv.Value)).ToList();
        var sankeyLinks = links.OrderByDescending(kv => kv.Value)
            .Select(kv => new SankeyLink(kv.Key.Item1, kv.Key.Item2, kv.Value)).ToList();

        _logger.LogInformation("Sankey breakdown for {Slug}/{Airport}: {Nodes} nodes, {Links} links",
            tenantSlug, filters.Airport, sankeyNodes.Count, sankeyLinks.Count);
        return new SankeyResponse(sankeyNodes, sankeyLinks);
    }

    public async Task<AgentServiceMatrixResponse> GetAgentServiceMatrixAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // 1. Top agents by volume
        await using var agentsCmd = conn.CreateCommand();
        agentsCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
                    AND agent_no IS NOT NULL AND agent_no != ''
            )
            SELECT agent_no, ANY_VALUE(agent_name) AS name, COUNT(*) AS cnt
            FROM deduped
            GROUP BY agent_no
            ORDER BY cnt DESC
            LIMIT $limit";
        foreach (var p in parms) agentsCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        agentsCmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var agentNos = new List<string>();
        var agentNames = new List<string>();
        await using (var r = await agentsCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                agentNos.Add(r.GetString(0));
                agentNames.Add(r.IsDBNull(1) ? r.GetString(0) : r.GetString(1));
            }
        }

        if (agentNos.Count == 0)
            return new AgentServiceMatrixResponse(agentNos, agentNames, new List<string>(), new List<List<int>>());

        // 2. Service types (within the filtered + deduped set)
        await using var typesCmd = conn.CreateCommand();
        typesCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT DISTINCT service FROM deduped ORDER BY service";
        foreach (var p in parms) typesCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var types = new List<string>();
        await using (var r = await typesCmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) types.Add(r.GetString(0));

        // 3. Matrix values
        var agentNosList = agentNos.Select((_, i) => $"$ag{i}").ToArray();
        await using var matCmd = conn.CreateCommand();
        matCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
                    AND agent_no IN ({string.Join(",", agentNosList)})
            )
            SELECT agent_no, service, COUNT(*) AS cnt
            FROM deduped GROUP BY agent_no, service";
        foreach (var p in parms) matCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        for (var i = 0; i < agentNos.Count; i++) matCmd.Parameters.Add(new DuckDBParameter($"ag{i}", agentNos[i]));

        var counts = new Dictionary<(string, string), int>();
        await using (var r = await matCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
                counts[(r.GetString(0), r.GetString(1))] = Convert.ToInt32(r.GetValue(2));
        }

        var values = agentNos.Select(a => types.Select(t => counts.GetValueOrDefault((a, t), 0)).ToList()).ToList();

        _logger.LogInformation("Agent-service matrix for {Slug}/{Airport}: {A}×{T}",
            tenantSlug, filters.Airport, agentNos.Count, types.Count);
        return new AgentServiceMatrixResponse(agentNos, agentNames, types, values);
    }

    private async Task<List<BreakdownItem>> GroupCountAsync(
        string tenantSlug, PrmFilterParams filters, string col, bool skipNull, CancellationToken ct)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var nullGuard = skipNull ? $" AND {col} IS NOT NULL AND {col} != ''" : "";

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1{nullGuard}
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT {col} AS label, COUNT(*) AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped
            GROUP BY {col}
            ORDER BY cnt DESC";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var items = new List<BreakdownItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new BreakdownItem(
                Label: reader.GetString(0),
                Count: Convert.ToInt32(reader.GetValue(1)),
                Percentage: Convert.ToDouble(reader.GetValue(2))));
        }
        return items;
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~BreakdownServiceTests --nologo
```

Expected: `Passed: 6, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 127, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/BreakdownServiceTests.cs
git commit -m "feat(prm): migrate BreakdownService to DuckDB + Parquet"
```

---

## Task 10: Rewrite `KpiService`

Three endpoints: summary (with period-over-period), handling-distribution, requested-vs-provided.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/KpiService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/KpiServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/KpiServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class KpiServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private KpiService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new KpiService(_fx.Duck, _fx.Paths, NullLogger<KpiService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetSummaryAsync_NoDateRange_SkipsPrevPeriod()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetSummaryAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalPrm > 0);
        Assert.Equal(0, r.TotalPrmPrevPeriod);
    }

    [Fact]
    public async Task GetSummaryAsync_WithDateRange_IncludesPrevPeriod()
    {
        var f = new PrmFilterParams
        {
            Airport = "DEL",
            DateFrom = new DateOnly(2026, 3, 1),
            DateTo = new DateOnly(2026, 3, 3)
        };
        var r = await _svc.GetSummaryAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalPrm > 0);
        Assert.True(r.TotalPrmPrevPeriod > 0); // Id 15-20 live before March 1
    }

    [Fact]
    public async Task GetHandlingDistributionAsync_SplitsBySelfVsOutsourced()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetHandlingDistributionAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Contains("SELF", r.Labels);
    }

    [Fact]
    public async Task GetRequestedVsProvidedAsync_BoundsFulfillmentRate()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRequestedVsProvidedAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalProvided > 0);
        Assert.InRange(r.FulfillmentRate, 0, 100);
    }
}
```

- [ ] **Step 2: Confirm fail**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~KpiServiceTests --nologo
```

Expected: compile fail.

- [ ] **Step 3: Rewrite `KpiService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/KpiService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class KpiService : SqlBaseQueryService
{
    private readonly ILogger<KpiService> _logger;

    public KpiService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<KpiService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<KpiSummaryResponse> GetSummaryAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        await using var session = await _duck.AcquireAsync(ct);

        var current = await ComputeSummaryMetricsAsync(session.Connection, path, filters, ct);

        var prev = (filters.DateFrom, filters.DateTo) switch
        {
            ({ } from, { } to) => await ComputeSummaryMetricsAsync(
                session.Connection, path,
                new PrmFilterParams
                {
                    Airport = filters.Airport,
                    DateFrom = GetPrevPeriodStart(from, to),
                    DateTo = from.AddDays(-1),
                    Airline = filters.Airline, Service = filters.Service,
                    HandledBy = filters.HandledBy, Flight = filters.Flight, AgentNo = filters.AgentNo
                }, ct),
            _ => SummaryMetrics.Zero
        };

        _logger.LogInformation("KPI summary for {Slug}/{Airport}: {TotalPrm}",
            tenantSlug, filters.Airport, current.TotalPrm);

        return new KpiSummaryResponse(
            TotalPrm: current.TotalPrm,
            TotalPrmPrevPeriod: prev.TotalPrm,
            TotalAgents: current.TotalAgents,
            AgentsSelf: current.AgentsSelf,
            AgentsOutsourced: current.AgentsOutsourced,
            AvgServicesPerAgentPerDay: current.AvgPerAgentPerDay,
            AvgServicesPrevPeriod: prev.AvgPerAgentPerDay,
            AvgDurationMinutes: current.AvgDuration,
            AvgDurationPrevPeriod: prev.AvgDuration,
            FulfillmentPct: current.FulfillmentPct);
    }

    public async Task<HandlingDistributionResponse> GetHandlingDistributionAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT prm_agent_type, COUNT(*) AS cnt
            FROM deduped
            GROUP BY prm_agent_type
            ORDER BY cnt DESC";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var labels = new List<string>();
        var values = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            labels.Add(reader.GetString(0));
            values.Add(Convert.ToInt32(reader.GetValue(1)));
        }

        _logger.LogInformation("Handling distribution for {Slug}/{Airport}: {Types}",
            tenantSlug, filters.Airport, labels.Count);
        return new HandlingDistributionResponse(labels, values);
    }

    public async Task<RequestedVsProvidedKpiResponse> GetRequestedVsProvidedAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT COUNT(*) AS provided, COALESCE(SUM(requested), 0) AS requested
            FROM deduped";
        foreach (var p in parms) cmd.Parameters.Add(p);

        int totalProvided = 0, totalRequested = 0;
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            if (await reader.ReadAsync(ct))
            {
                totalProvided = Convert.ToInt32(reader.GetValue(0));
                totalRequested = Convert.ToInt32(reader.GetValue(1));
            }
        }

        int providedAgainstRequested = Math.Min(totalProvided, totalRequested);
        double fulfillmentRate = totalProvided > 0 ? Math.Round(100.0 * totalRequested / totalProvided, 2) : 0;
        int walkUps = Math.Max(0, totalProvided - totalRequested);
        double walkUpRate = totalProvided > 0 ? Math.Round(100.0 * walkUps / totalProvided, 2) : 0;

        _logger.LogInformation("Requested vs provided for {Slug}/{Airport}: {Req} req, {Prov} prov",
            tenantSlug, filters.Airport, totalRequested, totalProvided);
        return new RequestedVsProvidedKpiResponse(
            totalRequested, totalProvided, providedAgainstRequested, fulfillmentRate, walkUpRate);
    }

    private record SummaryMetrics(
        int TotalPrm, int TotalAgents, int AgentsSelf, int AgentsOutsourced,
        double AvgPerAgentPerDay, double AvgDuration, double FulfillmentPct)
    {
        public static SummaryMetrics Zero { get; } = new(0, 0, 0, 0, 0, 0, 0);
    }

    private static async Task<SummaryMetrics> ComputeSummaryMetricsAsync(
        DuckDBConnection conn, string path, PrmFilterParams filters, CancellationToken ct)
    {
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn FROM filtered
                ) WHERE rn = 1
            ),
            durations AS (
                SELECT id, SUM({activeExpr}) AS d FROM filtered GROUP BY id
            )
            SELECT
                (SELECT COUNT(*) FROM deduped) AS total_prm,
                (SELECT COUNT(DISTINCT agent_no) FROM filtered
                    WHERE prm_agent_type = 'SELF' AND agent_no IS NOT NULL AND agent_no != '') AS self_agents,
                (SELECT COUNT(DISTINCT agent_no) FROM filtered
                    WHERE prm_agent_type != 'SELF' AND agent_no IS NOT NULL AND agent_no != '') AS outsourced_agents,
                (SELECT COUNT(DISTINCT service_date) FROM filtered) AS distinct_days,
                (SELECT ROUND(AVG(d), 2) FROM durations) AS avg_duration,
                (SELECT SUM(requested) FROM deduped) AS total_requested";
        foreach (var p in parms) cmd.Parameters.Add(p);

        int totalPrm = 0, selfAgents = 0, outsourcedAgents = 0, distinctDays = 0;
        int totalRequested = 0;
        double avgDuration = 0;
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            if (await r.ReadAsync(ct))
            {
                totalPrm         = Convert.ToInt32(r.GetValue(0));
                selfAgents       = Convert.ToInt32(r.GetValue(1));
                outsourcedAgents = Convert.ToInt32(r.GetValue(2));
                distinctDays     = Convert.ToInt32(r.GetValue(3));
                avgDuration      = r.IsDBNull(4) ? 0 : Convert.ToDouble(r.GetValue(4));
                totalRequested   = r.IsDBNull(5) ? 0 : Convert.ToInt32(r.GetValue(5));
            }
        }

        int totalAgents = selfAgents + outsourcedAgents;
        int totalDays = filters.DateFrom.HasValue && filters.DateTo.HasValue
            ? filters.DateTo.Value.DayNumber - filters.DateFrom.Value.DayNumber + 1
            : distinctDays;
        double avgPerAgentPerDay = totalAgents > 0 && totalDays > 0
            ? Math.Round((double)totalPrm / totalAgents / totalDays, 2) : 0;
        double fulfillmentPct = totalPrm > 0 ? Math.Round(100.0 * totalRequested / totalPrm, 2) : 0;

        return new SummaryMetrics(
            totalPrm, totalAgents, selfAgents, outsourcedAgents,
            avgPerAgentPerDay, avgDuration, fulfillmentPct);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~KpiServiceTests --nologo
```

Expected: `Passed: 4, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 131, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/KpiService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/KpiServiceTests.cs
git commit -m "feat(prm): migrate KpiService to DuckDB + Parquet"
```

---

## Task 11: Rewrite `PerformanceService`

Five endpoints: duration-distribution, duration-stats (with `quantile_cont`), no-shows, pause-analysis (with `LEAD`), duration-by-agent-type.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`
- Create: `backend/tests/PrmDashboard.Tests/PrmService/PerformanceServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/PrmService/PerformanceServiceTests.cs`:

```csharp
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class PerformanceServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private PerformanceService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new PerformanceService(_fx.Duck, _fx.Paths, NullLogger<PerformanceService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetDurationStatsAsync_ReturnsPositivePercentiles()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationStatsAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.Min >= 0);
        Assert.True(r.Avg >= r.Min);
        Assert.True(r.P95 >= r.Median);
    }

    [Fact]
    public async Task GetDurationStatsAsync_EmptyFilter_ReturnsAllZeros()
    {
        var f = new PrmFilterParams { Airport = "ZZZ" };
        var r = await _svc.GetDurationStatsAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(0, r.Min);
        Assert.Equal(0, r.P95);
    }

    [Fact]
    public async Task GetDurationDistributionAsync_BucketsCoverAllRows()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationDistributionAsync(PrmFixtureBuilder.Tenant, f);
        var sumCounts = r.Buckets.Sum(b => b.Count);
        Assert.True(sumCounts > 0);
        Assert.InRange(r.Buckets.Sum(b => b.Percentage), 99.0, 101.0);
    }

    [Fact]
    public async Task GetPauseAnalysisAsync_CountsPausedServices()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetPauseAnalysisAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalPaused >= 1); // Fixture Id=1 has a pause
        Assert.True(r.AvgPauseDurationMinutes > 0);
    }

    [Fact]
    public async Task GetNoShowsAsync_IdentifiesNoShowFlagN()
    {
        var f = new PrmFilterParams { Airport = "BOM" };
        var r = await _svc.GetNoShowsAsync(PrmFixtureBuilder.Tenant, f);
        // Fixture Id=3 at BOM has NoShowFlag='N'
        Assert.Contains(r.Items, i => i.Airline == "6E" && i.NoShows == 1);
    }

    [Fact]
    public async Task GetDurationByAgentTypeAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationByAgentTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.ServiceTypes.Count, r.Self.Count);
        Assert.Equal(r.ServiceTypes.Count, r.Outsourced.Count);
    }
}
```

- [ ] **Step 2: Confirm fail**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~PerformanceServiceTests --nologo
```

Expected: compile fail.

- [ ] **Step 3: Rewrite `PerformanceService.cs`**

Replace `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`:

```csharp
using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class PerformanceService : SqlBaseQueryService
{
    private readonly ILogger<PerformanceService> _logger;

    public PerformanceService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<PerformanceService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<DurationDistributionResponse> GetDurationDistributionAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH durations AS (
                SELECT id, SUM({activeExpr}) AS d
                FROM '{path}' WHERE {where}
                GROUP BY id
            )
            SELECT
                SUM(CASE WHEN d >=  0 AND d < 15 THEN 1 ELSE 0 END) AS b015,
                SUM(CASE WHEN d >= 15 AND d < 30 THEN 1 ELSE 0 END) AS b1530,
                SUM(CASE WHEN d >= 30 AND d < 45 THEN 1 ELSE 0 END) AS b3045,
                SUM(CASE WHEN d >= 45 AND d < 60 THEN 1 ELSE 0 END) AS b4560,
                SUM(CASE WHEN d >= 60 AND d < 90 THEN 1 ELSE 0 END) AS b6090,
                SUM(CASE WHEN d >= 90                THEN 1 ELSE 0 END) AS b90p,
                COUNT(*) AS total,
                ROUND(AVG(d), 2) AS avg_d,
                ROUND(quantile_cont(d, 0.5), 2) AS p50,
                ROUND(quantile_cont(d, 0.9), 2) AS p90
            FROM durations";
        foreach (var p in parms) cmd.Parameters.Add(p);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct) || reader.IsDBNull(6) || Convert.ToInt32(reader.GetValue(6)) == 0)
            return new DurationDistributionResponse(new List<DurationBucket>(), 0, 0, 0);

        var b = new int[]
        {
            Convert.ToInt32(reader.GetValue(0)), Convert.ToInt32(reader.GetValue(1)),
            Convert.ToInt32(reader.GetValue(2)), Convert.ToInt32(reader.GetValue(3)),
            Convert.ToInt32(reader.GetValue(4)), Convert.ToInt32(reader.GetValue(5))
        };
        int total = Convert.ToInt32(reader.GetValue(6));
        double avg = Convert.ToDouble(reader.GetValue(7));
        double p50 = reader.IsDBNull(8) ? 0 : Convert.ToDouble(reader.GetValue(8));
        double p90 = reader.IsDBNull(9) ? 0 : Convert.ToDouble(reader.GetValue(9));

        var labels = new[] { "0-15", "15-30", "30-45", "45-60", "60-90", "90+" };
        var buckets = labels.Select((l, i) => new DurationBucket(l, b[i],
            total > 0 ? Math.Round(100.0 * b[i] / total, 2) : 0)).ToList();

        _logger.LogInformation("Duration distribution for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, total);
        return new DurationDistributionResponse(buckets, p50, p90, avg);
    }

    public async Task<DurationStatsResponse> GetDurationStatsAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH durations AS (
                SELECT id, SUM({activeExpr}) AS d
                FROM '{path}' WHERE {where}
                GROUP BY id
            )
            SELECT
                COUNT(*) AS n,
                ROUND(MIN(d), 2), ROUND(MAX(d), 2), ROUND(AVG(d), 2),
                ROUND(quantile_cont(d, 0.5), 2),
                ROUND(quantile_cont(d, 0.9), 2),
                ROUND(quantile_cont(d, 0.95), 2)
            FROM durations";
        foreach (var p in parms) cmd.Parameters.Add(p);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct) || Convert.ToInt32(reader.GetValue(0)) == 0)
            return new DurationStatsResponse(0, 0, 0, 0, 0, 0);

        return new DurationStatsResponse(
            Min: Convert.ToDouble(reader.GetValue(1)),
            Max: Convert.ToDouble(reader.GetValue(2)),
            Avg: Convert.ToDouble(reader.GetValue(3)),
            Median: Convert.ToDouble(reader.GetValue(4)),
            P90: Convert.ToDouble(reader.GetValue(5)),
            P95: Convert.ToDouble(reader.GetValue(6)));
    }

    public async Task<NoShowResponse> GetNoShowsAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT airline,
                   COUNT(*) AS total,
                   SUM(CASE WHEN no_show_flag = 'N' THEN 1 ELSE 0 END) AS no_shows,
                   CASE WHEN COUNT(*) > 0
                        THEN ROUND(100.0 * SUM(CASE WHEN no_show_flag = 'N' THEN 1 ELSE 0 END) / COUNT(*), 2)
                        ELSE 0.0 END AS rate
            FROM deduped
            GROUP BY airline
            ORDER BY no_shows DESC";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var items = new List<NoShowItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new NoShowItem(
                Airline: reader.GetString(0),
                Total: Convert.ToInt32(reader.GetValue(1)),
                NoShows: Convert.ToInt32(reader.GetValue(2)),
                Rate: Convert.ToDouble(reader.GetValue(3))));
        }

        _logger.LogInformation("No-show analysis for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new NoShowResponse(items);
    }

    public async Task<PauseAnalysisResponse> GetPauseAnalysisAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var toMinPaused = HhmmSql.ToMinutes("paused_at");
        var toMinNext = HhmmSql.ToMinutes("next_start");

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // 1. Counts + avg pause gap in one query
        await using var statsCmd = conn.CreateCommand();
        statsCmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            gaps AS (
                SELECT id, paused_at,
                       LEAD(start_time) OVER (PARTITION BY id ORDER BY row_id) AS next_start
                FROM filtered
            )
            SELECT
                (SELECT COUNT(DISTINCT id) FROM filtered) AS total_services,
                (SELECT COUNT(DISTINCT id) FROM filtered WHERE paused_at IS NOT NULL) AS paused_services,
                (SELECT ROUND(AVG({toMinNext} - {toMinPaused}), 2) FROM gaps
                    WHERE paused_at IS NOT NULL AND next_start IS NOT NULL AND next_start > paused_at) AS avg_pause";
        foreach (var p in parms) statsCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        int totalServices = 0, pausedServices = 0;
        double avgPause = 0;
        await using (var r = await statsCmd.ExecuteReaderAsync(ct))
        {
            if (await r.ReadAsync(ct))
            {
                totalServices = Convert.ToInt32(r.GetValue(0));
                pausedServices = Convert.ToInt32(r.GetValue(1));
                avgPause = r.IsDBNull(2) ? 0 : Convert.ToDouble(r.GetValue(2));
            }
        }

        double pauseRate = totalServices > 0
            ? Math.Round(100.0 * pausedServices / totalServices, 2) : 0;

        // 2. Breakdown by service type for paused services only
        await using var byTypeCmd = conn.CreateCommand();
        byTypeCmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            paused_ids AS (SELECT DISTINCT id FROM filtered WHERE paused_at IS NOT NULL),
            deduped AS (
                SELECT f.* FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn FROM filtered
                ) f WHERE rn = 1 AND id IN (SELECT id FROM paused_ids)
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT service, COUNT(*) AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped
            GROUP BY service
            ORDER BY cnt DESC";
        foreach (var p in parms) byTypeCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var byType = new List<BreakdownItem>();
        await using (var r = await byTypeCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                byType.Add(new BreakdownItem(
                    Label: r.GetString(0),
                    Count: Convert.ToInt32(r.GetValue(1)),
                    Percentage: Convert.ToDouble(r.GetValue(2))));
            }
        }

        _logger.LogInformation("Pause analysis for {Slug}/{Airport}: {Paused}/{Total}",
            tenantSlug, filters.Airport, pausedServices, totalServices);
        return new PauseAnalysisResponse(pausedServices, pauseRate, avgPause, byType);
    }

    public async Task<DurationByAgentTypeResponse> GetDurationByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            per_service AS (
                SELECT id, MIN(row_id) AS min_row_id, SUM({activeExpr}) AS d
                FROM filtered GROUP BY id
            ),
            canonical AS (
                SELECT f.prm_agent_type, f.service, ps.d
                FROM filtered f
                INNER JOIN per_service ps ON ps.min_row_id = f.row_id
            )
            SELECT service, prm_agent_type, ROUND(AVG(d), 1) AS avg_d
            FROM canonical
            GROUP BY service, prm_agent_type
            ORDER BY service, prm_agent_type";
        foreach (var p in parms) cmd.Parameters.Add(p);

        var buckets = new Dictionary<string, Dictionary<string, double>>();
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var svc = r.GetString(0);
                var at  = r.GetString(1);
                var d   = Convert.ToDouble(r.GetValue(2));
                if (!buckets.TryGetValue(svc, out var dict)) buckets[svc] = dict = new();
                dict[at] = d;
            }
        }

        var types = buckets.Keys.OrderBy(k => k).ToList();
        var selfAvg = types.Select(t => buckets[t].GetValueOrDefault("SELF")).ToList();
        var outsourcedAvg = types.Select(t => buckets[t].GetValueOrDefault("OUTSOURCED")).ToList();

        _logger.LogInformation("Duration by agent type for {Slug}/{Airport}: {Types}", tenantSlug, filters.Airport, types.Count);
        return new DurationByAgentTypeResponse(types, selfAvg, outsourcedAvg);
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter FullyQualifiedName~PerformanceServiceTests --nologo
```

Expected: `Passed: 6, Failed: 0`.

- [ ] **Step 5: Full suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 137, Failed: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs \
        backend/tests/PrmDashboard.Tests/PrmService/PerformanceServiceTests.cs
git commit -m "feat(prm): migrate PerformanceService to DuckDB + Parquet"
```

---

## Task 12: Delete legacy EF scaffold + rename `SqlBaseQueryService` → `BaseQueryService`

All 7 query services now inherit from `SqlBaseQueryService` and use DuckDB. The legacy `BaseQueryService`, `Data/` folder, and their DI wiring are dead weight. Drop them and rename the new base.

**Files:**
- Delete: `backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs`
- Delete: `backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`
- Delete: `backend/src/PrmDashboard.PrmService/Data/TenantNotFoundException.cs`
- Delete: `backend/src/PrmDashboard.PrmService/Data/` (empty)
- Delete: `backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs` (legacy)
- Rename: `Services/SqlBaseQueryService.cs` → `Services/BaseQueryService.cs`
- Rename: `tests/PrmService/SqlBaseQueryServiceTests.cs` → `tests/PrmService/BaseQueryServiceTests.cs`
- Modify: `backend/src/PrmDashboard.PrmService/Program.cs`
- Modify: `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj`
- Modify: `backend/src/PrmDashboard.PrmService/appsettings.json`
- Modify: `backend/src/PrmDashboard.PrmService/appsettings.Development.json`

- [ ] **Step 1: Delete the legacy `Data/` folder and contents**

```bash
rm backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs
rm backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs
rm backend/src/PrmDashboard.PrmService/Data/TenantNotFoundException.cs
rmdir backend/src/PrmDashboard.PrmService/Data
```

- [ ] **Step 2: Delete the legacy `BaseQueryService.cs`**

```bash
rm backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs
```

- [ ] **Step 3: Rename `SqlBaseQueryService` to `BaseQueryService` (class + file)**

Rename the file:

```bash
git mv backend/src/PrmDashboard.PrmService/Services/SqlBaseQueryService.cs \
       backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs
```

Open the new `Services/BaseQueryService.cs` and rename the class:

- `public abstract class SqlBaseQueryService` → `public abstract class BaseQueryService`
- `protected SqlBaseQueryService(` → `protected BaseQueryService(`

Rename all 7 service files' base class references. In each of:
- `Services/FilterService.cs`
- `Services/RecordService.cs`
- `Services/RankingService.cs`
- `Services/TrendService.cs`
- `Services/BreakdownService.cs`
- `Services/KpiService.cs`
- `Services/PerformanceService.cs`

Replace `: SqlBaseQueryService` with `: BaseQueryService`.

- [ ] **Step 4: Rename the test class + file**

```bash
git mv backend/tests/PrmDashboard.Tests/PrmService/SqlBaseQueryServiceTests.cs \
       backend/tests/PrmDashboard.Tests/PrmService/BaseQueryServiceTests.cs
```

Open the new `BaseQueryServiceTests.cs` and replace:
- `public class SqlBaseQueryServiceTests` → `public class BaseQueryServiceTests`
- `SqlBaseQueryService.BuildWhereClauseForTest(` → `BaseQueryService.BuildWhereClauseForTest(`
- `SqlBaseQueryService.GetPrevPeriodStartForTest(` → `BaseQueryService.GetPrevPeriodStartForTest(`

- [ ] **Step 5: Remove legacy DI wiring from `Program.cs`**

In `backend/src/PrmDashboard.PrmService/Program.cs`, delete the following blocks:

```csharp
// Memory cache for tenant connection caching
builder.Services.AddMemoryCache();

// HttpContextAccessor — TenantDbContextFactory needs it to forward Bearer tokens
builder.Services.AddHttpContextAccessor();

// TenantDbContextFactory — resolves tenant DBs via TenantService HTTP calls
var tenantServiceUrl = builder.Configuration["TenantServiceUrl"]
    ?? throw new InvalidOperationException("TenantServiceUrl is required");

builder.Services.AddHttpClient<TenantDbContextFactory>(client =>
{
    client.BaseAddress = new Uri(tenantServiceUrl);
});
```

Also delete the obsolete `using PrmDashboard.PrmService.Data;` directive at the top of the file.

- [ ] **Step 6: Remove EF/MySQL packages from the csproj**

Open `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj` and delete these `<PackageReference>` lines (if present):

```xml
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="..." />
<PackageReference Include="Pomelo.EntityFrameworkCore.MySql" Version="..." />
<PackageReference Include="MySqlConnector" Version="..." />
```

Leave `InternalsVisibleTo` and all other references intact.

- [ ] **Step 7: Remove `ConnectionStrings:TenantDbTemplate` + `TenantServiceUrl` from appsettings**

In `backend/src/PrmDashboard.PrmService/appsettings.json` and `appsettings.Development.json`, delete any `ConnectionStrings` block containing `TenantDbTemplate` and any top-level `TenantServiceUrl` key. Keep `DataPath`, `Jwt`, `Cors`, `Logging`, `AllowedHosts` etc. intact.

- [ ] **Step 8: Build to verify no references leaked**

```bash
dotnet build backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 9: Grep for residual references — each must return zero matches**

```bash
grep -rn "TenantDbContext\|TenantDbContextFactory\|TenantNotFoundException\|SqlBaseQueryService\|MySqlConnector\|Pomelo\|EntityFrameworkCore" \
  backend/src/PrmDashboard.PrmService \
  --include="*.cs" --include="*.csproj" \
  || echo "OK — no matches"
```

Expected: `OK — no matches` (or empty).

- [ ] **Step 10: Run the full test suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 137, Failed: 0`.

- [ ] **Step 11: Commit**

```bash
git add -A backend/src/PrmDashboard.PrmService backend/tests/PrmDashboard.Tests/PrmService
git commit -m "chore(prm): drop EF/MySQL scaffold, rename SqlBaseQueryService to BaseQueryService"
```

---

## Task 13: Final verification (no commit)

Independent cross-checks against the success criteria. No file changes.

- [ ] **Step 1: Solution builds clean**

```bash
dotnet build backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: All tests pass (baseline 91 → 138+)**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 137+, Failed: 0`.

- [ ] **Step 3: Every `TODO(perf)` comment in PrmService source is gone**

```bash
grep -rn "TODO(perf)" backend/src/PrmDashboard.PrmService --include="*.cs" || echo "OK — all TODO(perf) resolved"
```

Expected: `OK — all TODO(perf) resolved`.

- [ ] **Step 4: No callers of TenantService `/resolve` remain in the codebase**

```bash
grep -rn "api/tenants/resolve\|/resolve/" backend/src --include="*.cs" || echo "OK — no callers"
```

Expected: the only match should be in `PrmDashboard.TenantService/Controllers/TenantController.cs` (the endpoint definition itself, which 3d-2 deletes). If PrmService or any other service still references it, investigate.

- [ ] **Step 5: `Data/` folder gone from PrmService**

```bash
test ! -d backend/src/PrmDashboard.PrmService/Data && echo "OK — Data/ removed"
```

Expected: `OK — Data/ removed`.

- [ ] **Step 6: Solution structure snapshot**

```bash
ls backend/src/PrmDashboard.PrmService/Services/ backend/src/PrmDashboard.PrmService/Sql/
```

Expected output (order may vary):

```
Services/:
BaseQueryService.cs  BreakdownService.cs  FilterService.cs  KpiService.cs
PerformanceService.cs  RankingService.cs  RecordService.cs  TrendService.cs

Sql/:
HhmmSql.cs
```

- [ ] **Step 7: Docker stack spot-check (optional, manual)**

```bash
cp .env.example .env
docker compose up --build
```

Then in another terminal, log in and hit every dashboard tab. Compare numbers against the pre-rewrite build via `docs/e2e-checklist.md`. Percentile-typed fields may differ by ≤1 minute from legacy — this is the accepted `quantile_cont` vs nearest-rank drift.

- [ ] **Step 8: Branch ready to merge**

```bash
git log --oneline main..HEAD
```

Expected: ~12 commits, one per task, each green.

---

## Success criteria (recap from spec)

1. ✅ Task 12 Step 9 proves no `MySqlConnector`/`Pomelo`/`EntityFrameworkCore`/`TenantDbContext*` references in PrmService source.
2. ✅ Task 13 Step 5 confirms `Data/` directory is gone.
3. ✅ Task 13 Step 3 confirms every `TODO(perf)` comment is resolved.
4. ✅ Task 13 Step 2 confirms `Passed: 137+, Failed: 0`.
5. Task 13 Step 7 exercises the dockerised stack (manual, optional).
6. ✅ Task 13 Step 4 confirms no callers of `/api/tenants/resolve` remain. The endpoint still exists in TenantService (deleted in 3d-2).
7. Snapshot tests per endpoint achieve parity against the seed fixture (built into Tasks 5–11).
8. ✅ No changes outside `PrmDashboard.PrmService/` + `PrmDashboard.Tests/PrmService/` — verifiable via `git diff --stat main..HEAD`.
