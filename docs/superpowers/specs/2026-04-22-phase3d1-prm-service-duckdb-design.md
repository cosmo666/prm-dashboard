# Phase 3d-1 — PrmService Swap — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Scope:** Replace PrmService's EF Core + MySQL data access with DuckDB reads over `{root}/{slug}/prm_services.parquet`. Rewrite all 25 analytics endpoints (8 services, ~1,500 LOC) to run aggregation in SQL rather than materialising rows into C#. Delete `TenantDbContextFactory`, `TenantDbContext`, `TenantNotFoundException`, and the HTTP path from PrmService → TenantService `/resolve`. Depends on Phase 3a foundation primitives. The companion Phase 3d-2 spec handles downstream cleanup (deleting `/resolve`, vestigial DTOs, `RefreshToken.cs`, `Tenant.cs` db_\* fields, EF packages from Shared + TenantService).

## Goals

1. All 25 PRM analytics endpoints read from `{root}/{slug}/prm_services.parquet` via the Phase 3a `IDuckDbContext` + `TenantParquetPaths`.
2. Push dedup + aggregation into DuckDB SQL. Every `// TODO(perf): materializes filtered rows into memory then aggregates in C#` comment is resolved by moving the work into `ROW_NUMBER()`, `quantile_cont`, `LEAD`, etc.
3. Delete `TenantDbContextFactory`, `TenantDbContext`, `TenantNotFoundException`, and the `HttpClient` → `/api/tenants/resolve/{slug}` path from PrmService.
4. `BaseQueryService` becomes a SQL-fragment builder: `(whereClause, parameters)` tuple. Every service inlines the fragment into a string-interpolated DuckDB query.
5. `MySqlConnector`, `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore` dropped from `PrmDashboard.PrmService.csproj`.
6. Response DTOs (`BreakdownResponse`, `SankeyResponse`, `DurationStatsResponse`, etc.) unchanged — contracts with the Angular frontend are preserved byte-for-byte.

## Non-goals

- **Deleting `/resolve/{slug}` or `LegacyTenantResolveData`.** After this phase the endpoint has zero callers, but removing it (and the `TenantResolveResponse` DTO) is Phase 3d-2 work.
- **Touching `Shared/Models/Tenant.cs` db_\* fields or `Shared/Models/RefreshToken.cs`.** Still referenced by the frozen Shared EF entity graph; 3d-2 strips these.
- **Removing EF/MySQL packages from `PrmDashboard.Shared.csproj` or `PrmDashboard.TenantService.csproj`.** 3d-2.
- **Changing `PrmControllerBase`, the `X-Tenant-Slug` header contract, `AirportAccessMiddleware`, or `ExceptionHandlerMiddleware`.** Pure data-layer rewrite; the HTTP surface is untouched.
- **Changing `PrmFilterParams` or any response DTO.** Wire format frozen.
- **Adding new endpoints or behaviour changes.** Same 25 endpoints, same inputs, same outputs.
- **Frontend, Gateway Ocelot config, docker-compose, or `appsettings.*` schema changes beyond swapping `ConnectionStrings:TenantDbTemplate` → `DataPath`.**

## Target architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│  AirportAccessMiddleware (unchanged)                                 │
│    Validates ?airport=… against JWT airports claim. No DB access.    │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7 Controllers (unchanged public surface):                           │
│    Breakdowns / Filters / Kpis / Performance / Rankings /            │
│    Records / Trends                                                  │
│    Each calls `GetTenantSlug()` and delegates to its service.        │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ injects
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  8 Query Services (rewritten):                                       │
│    BaseQueryService, BreakdownService, FilterService, KpiService,    │
│    PerformanceService, RankingService, RecordService, TrendService   │
│                                                                      │
│    ctor(IDuckDbContext duck, TenantParquetPaths paths,               │
│         ILogger<T> log)                                              │
│                                                                      │
│    Each method:                                                      │
│      1. var path = _paths.TenantPrmServices(slug);                   │
│      2. var (where, parms) = BuildWhereClause(filters);              │
│      3. await using var session = await _duck.AcquireAsync(ct);      │
│      4. await using var cmd = session.Connection.CreateCommand();    │
│      5. cmd.CommandText = $@"...FROM '{path}' WHERE {where} ...";    │
│      6. foreach (parm in parms) cmd.Parameters.Add(parm);            │
│      7. read + project into DTO                                      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ injects
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  IDuckDbContext (Phase 3a — unchanged)                               │
│  TenantParquetPaths (Phase 3a — unchanged)                           │
│    TenantPrmServices(slug) → {root}/{slug}/prm_services.parquet      │
└─────────────────────────────────────────────────────────────────────┘
```

**No new infrastructure.** The phase exclusively swaps the data layer of each service.

**No `TenantLookup`-style dict load in PrmService.** The slug → parquet path mapping is a pure string function (`TenantParquetPaths.TenantPrmServices(slug)`); PrmService never needs to know *which* tenants exist, only that the header it received resolves to a file path. If the file is missing, DuckDB returns an IO error which `ExceptionHandlerMiddleware` converts to ProblemDetails.

## Decisions

| Decision | Value | Why |
|---|---|---|
| Tenant → Parquet path | `_paths.TenantPrmServices(slug)` — pure string function, no lookup | Gateway injects `X-Tenant-Slug`; middleware has already authorised the request. The slug → filesystem path is a pure convention established in Phase 3a. No dict, no HTTP call, no cache. |
| Aggregation strategy | DuckDB SQL (ROW_NUMBER for dedup, quantile_cont for percentiles, LEAD for pause gaps) | Resolves every `TODO(perf)` comment. DuckDB was chosen precisely for native Parquet aggregation — keeping C#-side GroupBy would waste the rewrite. |
| Filter abstraction | `BaseQueryService.BuildWhereClause(filters)` returns `(string sqlFragment, IReadOnlyList<DuckDBParameter> parameters)` | One place for filter semantics (airport CSV, date range, airline/service/handled_by CSVs, flight, agent_no). Each service composes `WHERE {fragment}` into its own query. Pure function, no DB calls. |
| Query style | String-interpolated SQL with parameterized values | DuckDB.NET uses named `$param` placeholders; path literals are trusted (server-owned convention), slug-derived, and escaped via `EscapeSingleQuotes`. User-supplied values always go through `DuckDBParameter`. |
| Session lifetime | `await using var session = await _duck.AcquireAsync(ct)` per service-method call | Matches the proven Phase 3b/3c pattern. No cross-request state; pool handles connection reuse. |
| HHMM → minutes in SQL | Inline expression `(CAST(col / 100 AS INTEGER) * 60 + (col % 100))` via a static `HhmmSql.ToMinutes(colExpr)` helper | DuckDB macros would need CREATE MACRO per-session, adding startup cost. C# string helper keeps it explicit and testable. Same encoding convention as `TimeHelpers.HhmmToMinutes` but executed in SQL. |
| Active-minutes per segment | `(end_or_pause_minutes - start_minutes)` where `end_or_pause = COALESCE(paused_at, end_time)` | Mirrors `TimeHelpers.CalculateActiveMinutes` behaviour. Paused rows use the pause timestamp as the upper bound; completed rows use `end_time`. Clamped to `≥ 0` via `GREATEST(..., 0)` in case of clock skew. |
| Pause duration | `LEAD(start_time) OVER (PARTITION BY id ORDER BY row_id) - paused_at` (both converted to minutes) | Replaces the C# loop over `segments[i+1].StartTime - segments[i].PausedAt`. Correct by construction — `LEAD` returns NULL on the final segment so those rows drop out of the AVG automatically. |
| Dedup policy | `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id)` then `WHERE rn = 1` in a CTE — the first-row convention matches current C# behaviour | Phase 1 dedup rule: same `id` can appear in multiple rows (pause/resume); the first row (lowest `row_id`) holds the canonical metadata (airline, service, locations). |
| Records endpoint pagination | SQL `LIMIT $limit OFFSET $offset` + a second `SELECT COUNT(*)` query in the same session | Matches existing `EF` paginated behaviour (returns rows + total count). |
| Segment-detail endpoint | `SELECT * FROM '{path}' WHERE id = $id ORDER BY row_id` — no dedup | Segments endpoint returns all rows for a service id, in order; dedup would defeat the purpose. |
| Ranking limit default | Each endpoint's existing default (`top = 10`) preserved | Behavioural parity — no frontend change. |
| Error handling | DuckDB IO failures (missing Parquet, locked file) bubble up as `DuckDBException` → `ExceptionHandlerMiddleware` → ProblemDetails 500 | Avoid a custom `TenantNotFoundException` path; the middleware already formats errors. Logs include slug + file path. |
| Test fixtures | Each service has an integration test class in `backend/tests/PrmDashboard.Tests/PrmService/`, using a temp Parquet built via a shared `PrmFixtureBuilder` helper | Mirrors 3c pattern. Fixture writes a `prm_services.parquet` with deterministic rows covering dedup, pause/resume, multi-airport, and no-show scenarios. |
| Package removal | Drop `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, `MySqlConnector` from `PrmDashboard.PrmService.csproj` | Forces compile-time verification that no MySQL/EF reference leaked into the rewrite. |
| `appsettings.*` | Remove `ConnectionStrings:TenantDbTemplate`; add `DataPath` + optional `DataPath:PoolSize` | Same pattern as Auth/Tenant after 3b/3c. |

## File structure

Modified:

- `backend/src/PrmDashboard.PrmService/Services/BaseQueryService.cs` — rewrite: `BuildWhereClause` returns `(string, IReadOnlyList<DuckDBParameter>)`; no DbContext factory.
- `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs` — rewrite: 6 methods → 6 SQL queries.
- `backend/src/PrmDashboard.PrmService/Services/FilterService.cs` — rewrite: one `SELECT DISTINCT` per dimension, combined.
- `backend/src/PrmDashboard.PrmService/Services/KpiService.cs` — rewrite: 3 methods including current-vs-previous-period summary.
- `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs` — rewrite: 5 methods including LEAD-based pause analysis and `quantile_cont`-based percentiles.
- `backend/src/PrmDashboard.PrmService/Services/RankingService.cs` — rewrite: 4 methods with top-N LIMIT clauses.
- `backend/src/PrmDashboard.PrmService/Services/RecordService.cs` — rewrite: paginated records + segment detail.
- `backend/src/PrmDashboard.PrmService/Services/TrendService.cs` — rewrite: 4 time-series aggregations (daily/hourly/monthly + requested-vs-provided).
- `backend/src/PrmDashboard.PrmService/Program.cs` — swap DI wiring (drop EF+HttpClient; add DuckDB primitives).
- `backend/src/PrmDashboard.PrmService/PrmDashboard.PrmService.csproj` — remove 3 EF/MySQL packages.
- `backend/src/PrmDashboard.PrmService/appsettings.json` + `.Development.json` — replace `ConnectionStrings:TenantDbTemplate` with `DataPath`.

Created:

- `backend/src/PrmDashboard.PrmService/Sql/HhmmSql.cs` — static helper: `ToMinutes(colExpr)`, `ActiveMinutesExpr(startCol, pausedAtCol, endCol)`.
- `backend/tests/PrmDashboard.Tests/PrmService/PrmFixtureBuilder.cs` — writes temp `prm_services.parquet` with seeded rows.
- `backend/tests/PrmDashboard.Tests/PrmService/BreakdownServiceTests.cs` — ~6 tests (one per endpoint).
- `backend/tests/PrmDashboard.Tests/PrmService/FilterServiceTests.cs` — ~2 tests.
- `backend/tests/PrmDashboard.Tests/PrmService/KpiServiceTests.cs` — ~4 tests (summary + 2 other KPI endpoints + period-over-period).
- `backend/tests/PrmDashboard.Tests/PrmService/PerformanceServiceTests.cs` — ~6 tests (including pause/no-show edge cases).
- `backend/tests/PrmDashboard.Tests/PrmService/RankingServiceTests.cs` — ~4 tests.
- `backend/tests/PrmDashboard.Tests/PrmService/RecordServiceTests.cs` — ~3 tests (list, pagination, segments).
- `backend/tests/PrmDashboard.Tests/PrmService/TrendServiceTests.cs` — ~5 tests.
- `backend/tests/PrmDashboard.Tests/PrmService/BaseQueryServiceTests.cs` — ~4 pure-unit tests for `BuildWhereClause` (no DuckDB needed).

Total new tests: **~34**, bringing the suite from 91 → ~125.

Deleted:

- `backend/src/PrmDashboard.PrmService/Data/TenantDbContext.cs`
- `backend/src/PrmDashboard.PrmService/Data/TenantDbContextFactory.cs`
- `backend/src/PrmDashboard.PrmService/Data/TenantNotFoundException.cs`
- `backend/src/PrmDashboard.PrmService/Data/` (empty folder)

**No other files** change. In particular: controllers, `PrmControllerBase`, `AirportAccessMiddleware`, `ExceptionHandlerMiddleware`, Shared DTOs, Shared Models, AuthService, TenantService, Gateway, frontend, docker-compose — all unchanged.

## Components

### `HhmmSql` helper (new)

```csharp
public static class HhmmSql
{
    /// <summary>
    /// SQL expression converting an HHMM INTEGER column to total minutes.
    /// Example: 945 (9:45) → 585.
    /// </summary>
    public static string ToMinutes(string colExpr) =>
        $"(CAST({colExpr} / 100 AS INTEGER) * 60 + ({colExpr} % 100))";

    /// <summary>
    /// SQL expression for the active-minutes contribution of a single row.
    /// Mirrors <see cref="TimeHelpers.CalculateActiveMinutes"/>:
    /// <code>(COALESCE(paused_at, end_time) - start_time)</code> in minutes,
    /// clamped to ≥ 0.
    /// </summary>
    public static string ActiveMinutesExpr(string startCol, string pausedAtCol, string endCol) =>
        $"GREATEST({ToMinutes($"COALESCE({pausedAtCol}, {endCol})")} - {ToMinutes(startCol)}, 0)";
}
```

Unit-tested via golden-string comparison (no DuckDB needed).

### `BaseQueryService` rewrite

```csharp
public abstract class BaseQueryService
{
    protected readonly IDuckDbContext _duck;
    protected readonly TenantParquetPaths _paths;

    protected BaseQueryService(IDuckDbContext duck, TenantParquetPaths paths)
    {
        _duck = duck;
        _paths = paths;
    }

    /// <summary>
    /// Builds a parameterised WHERE fragment from <see cref="PrmFilterParams"/>.
    /// Callers embed via: <c>SELECT … FROM '{path}' WHERE {fragment} …</c>.
    /// The fragment is always non-empty — airport is required.
    /// </summary>
    protected static (string Sql, IReadOnlyList<DuckDBParameter> Parameters) BuildWhereClause(
        PrmFilterParams filters)
    {
        var sb = new StringBuilder();
        var parms = new List<DuckDBParameter>();
        var i = 0;

        // Airport: CSV or single (middleware has already authorised every one).
        var airports = filters.AirportList;
        if (airports is { Length: > 0 })
        {
            var placeholders = string.Join(",", airports.Select(_ => $"$a{i++}"));
            sb.Append($"loc_name IN ({placeholders})");
            foreach (var a in airports) parms.Add(new DuckDBParameter($"a{parms.Count}", a));
        }
        else
        {
            sb.Append($"loc_name = $a{i}");
            parms.Add(new DuckDBParameter($"a{i}", filters.Airport ?? ""));
            i++;
        }

        if (filters.DateFrom.HasValue) { sb.Append($" AND service_date >= $df"); parms.Add(new("df", filters.DateFrom.Value)); }
        if (filters.DateTo.HasValue)   { sb.Append($" AND service_date <= $dt"); parms.Add(new("dt", filters.DateTo.Value)); }

        AppendInClause(sb, parms, "airline",         filters.AirlineList,    "al");
        AppendInClause(sb, parms, "service",         filters.ServiceList,    "sv");
        AppendInClause(sb, parms, "prm_agent_type",  filters.HandledByList,  "hb");

        if (!string.IsNullOrEmpty(filters.Flight))  { sb.Append(" AND flight = $f");   parms.Add(new("f",  filters.Flight)); }
        if (!string.IsNullOrEmpty(filters.AgentNo)) { sb.Append(" AND agent_no = $ag"); parms.Add(new("ag", filters.AgentNo)); }

        return (sb.ToString(), parms);
    }

    private static void AppendInClause(
        StringBuilder sb, List<DuckDBParameter> parms,
        string col, string[]? values, string prefix)
    {
        if (values is not { Length: > 0 }) return;
        var placeholders = string.Join(",", values.Select((_, i) => $"${prefix}{i}"));
        sb.Append($" AND {col} IN ({placeholders})");
        for (var i = 0; i < values.Length; i++) parms.Add(new DuckDBParameter($"{prefix}{i}", values[i]));
    }

    protected static DateOnly GetPrevPeriodStart(DateOnly from, DateOnly to)
    {
        var days = to.DayNumber - from.DayNumber + 1;
        return from.AddDays(-days);
    }

    protected static string EscapePath(string path) => path.Replace("'", "''");
}
```

### Representative SQL templates

Each service embeds these patterns. The plan (to follow this spec) will enumerate exact SQL per endpoint; the spec only pins the load-bearing patterns.

**Pattern 1 — dedup + group-count** (used in breakdown-by-airline / location / service-type):

```sql
WITH filtered AS (
    SELECT *
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
        FROM '{path}'
        WHERE {where}
    ) t
    WHERE rn = 1
)
SELECT airline,
       COUNT(*) AS cnt,
       ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) AS pct
FROM filtered
GROUP BY airline
ORDER BY cnt DESC;
```

**Pattern 2 — duration per id + percentiles** (duration-stats / duration-distribution):

```sql
WITH durations AS (
    SELECT id,
           SUM({HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time")}) AS duration_min
    FROM '{path}'
    WHERE {where}
    GROUP BY id
)
SELECT
    MIN(duration_min)                                         AS min_d,
    MAX(duration_min)                                         AS max_d,
    ROUND(AVG(duration_min), 2)                               AS avg_d,
    ROUND(quantile_cont(duration_min, 0.5), 2)                AS p50,
    ROUND(quantile_cont(duration_min, 0.9), 2)                AS p90,
    ROUND(quantile_cont(duration_min, 0.95), 2)               AS p95,
    COUNT(*)                                                  AS n
FROM durations;
```

**Pattern 3 — pause gap via LEAD** (pause-analysis):

```sql
WITH gaps AS (
    SELECT id,
           paused_at,
           LEAD(start_time) OVER (PARTITION BY id ORDER BY row_id) AS next_start
    FROM '{path}'
    WHERE {where}
),
pause_dur AS (
    SELECT {HhmmSql.ToMinutes("next_start")} - {HhmmSql.ToMinutes("paused_at")} AS pause_min
    FROM gaps
    WHERE paused_at IS NOT NULL
      AND next_start IS NOT NULL
      AND next_start > paused_at
)
SELECT ROUND(AVG(pause_min), 2) AS avg_pause_min
FROM pause_dur;
```

Plus a separate query for paused-service counts + breakdown by service type.

**Pattern 4 — time-series bucket** (trends/daily):

```sql
WITH filtered AS (
    SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
        FROM '{path}' WHERE {where}
    ) t WHERE rn = 1
)
SELECT service_date, COUNT(*) AS cnt
FROM filtered
GROUP BY service_date
ORDER BY service_date;
```

**Pattern 5 — period-over-period (KPI summary)**:

Two CTEs — current and previous — UNION'd with a discriminator column; or two queries in one session. Plan can pick either. Previous-period bounds come from `GetPrevPeriodStart(from, to)` → to-1-day.

### Startup wiring in `Program.cs`

Removed:

```csharp
var tenantDbTemplate = builder.Configuration.GetConnectionString("TenantDbTemplate")
    ?? throw new InvalidOperationException("ConnectionStrings:TenantDbTemplate is required");

builder.Services.AddHttpClient<TenantDbContextFactory>(c =>
    c.BaseAddress = new Uri(builder.Configuration["TenantService:BaseUrl"]!));

builder.Services.AddScoped<TenantDbContextFactory>();
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
```

The 8 service registrations (`BreakdownService`, `FilterService`, …) stay `AddScoped` — constructor signatures change from `(TenantDbContextFactory, ILogger<T>)` to `(IDuckDbContext, TenantParquetPaths, ILogger<T>)`.

## Testing strategy

All tests in `backend/tests/PrmDashboard.Tests/PrmService/`.

### `PrmFixtureBuilder`

Shared async-lifetime helper:

```csharp
public sealed class PrmFixtureBuilder : IAsyncLifetime
{
    public string RootPath { get; private set; } = null!;
    public TenantParquetPaths Paths { get; private set; } = null!;
    public IDuckDbContext Duck { get; private set; } = null!;

    public async Task InitializeAsync() { /* mkdir temp; write prm_services.parquet with known rows; wire paths + context */ }
    public async Task DisposeAsync()    { /* teardown */ }

    /// <summary>Seeds a deterministic ~40-row dataset covering:
    /// - multiple tenants (one active per test)
    /// - 2+ airports (DEL, BOM, HYD)
    /// - 4+ airlines, 5+ service types
    /// - paused/resumed services (id with 2+ rows, one with paused_at set)
    /// - no-show rows (NoShowFlag = 'N')
    /// - date range spanning ~30 days for period-over-period tests
    /// </summary>
    public static IReadOnlyList<PrmRow> SeedRows() { … }
}
```

One fixture, shared by all 8 service test classes via xUnit class fixtures.

### Per-service test classes

Each test:
1. `arrange` — instantiate service with fixture's `IDuckDbContext` + `TenantParquetPaths`.
2. `act` — call the method under test with a constructed `PrmFilterParams`.
3. `assert` — verify shape (counts, keys) AND ≥ 1 known numeric value from seeded data.

Key scenarios to cover (not exhaustive; plan will enumerate):
- `GetDurationStatsAsync_EmptyFilter_ReturnsAllZeros`
- `GetDurationStatsAsync_WithData_MatchesHandComputedPercentiles` (verifies `quantile_cont` matches C# nearest-rank within ±0.5min tolerance — parity is approximate because DuckDB uses linear interpolation)
- `GetPauseAnalysisAsync_PausedService_CountsOnce`
- `GetPauseAnalysisAsync_MultiplePauses_AvgGapMatchesManualCalc`
- `GetByAirlineAsync_MultiAirportCsv_DedupsAcrossAirports`
- `GetByAgentServiceMatrixAsync_TopNLimit_EnforcedInSql`
- `GetRecordsAsync_Pagination_ReturnsCorrectSliceAndTotal`
- `GetSegmentsAsync_UnknownId_ReturnsEmpty`
- `GetSummaryAsync_PreviousPeriodBoundary_InclusiveOnDayMinus1`
- `BuildWhereClause_AllFiltersSet_ProducesExpectedSqlAndParameters` (pure unit)
- `BuildWhereClause_MinimalFilter_AirportOnly` (pure unit)

## Success criteria

1. `grep -E "MySqlConnector|Pomelo|EntityFrameworkCore|TenantDbContext|TenantDbContextFactory|TenantNotFoundException" backend/src/PrmDashboard.PrmService --include="*.cs" --include="*.csproj"` returns zero matches.
2. `backend/src/PrmDashboard.PrmService/Data/` directory does not exist.
3. Every existing `// TODO(perf)` comment in the PrmService source tree is gone (all rewrites push dedup + aggregation into SQL).
4. Solution builds 0/0 warnings; all tests pass. Total test count grows from 91 → ~125.
5. `docker compose up` brings up all services; a logged-in user hitting every dashboard tab sees identical data to the pre-rewrite build (manual E2E — see `docs/e2e-checklist.md`).
6. `/api/tenants/resolve/{slug}` has **zero callers** in the codebase after this phase (verified via `grep -r "resolve/" backend/src`). The endpoint still exists and still returns legacy connection data from `tenants.parquet`; 3d-2 deletes it.
7. Response shapes byte-identical to the pre-rewrite service: JSON snapshot test of every endpoint against the seed dataset matches the EF-era baseline within numeric tolerance (`quantile_cont` vs nearest-rank is the only expected divergence, bounded to ±1 minute on percentile fields).
8. No change to AuthService, TenantService (beyond zero callers), Gateway, Shared DTOs, Shared Models, frontend, docker-compose, or Ocelot config.

## Open items to resolve during implementation

1. **Percentile algorithm parity.** DuckDB's `quantile_cont` uses linear interpolation; the EF-era `Percentile` helper uses nearest-rank. On small datasets these diverge by up to 1 minute. Options: (a) accept the drift as an upgrade (interpolation is more statistically sound), (b) match legacy via `quantile_disc`. Recommendation: **(a), document the drift in the plan's verification step** — the frontend rounds to whole minutes anyway.
2. **HhmmSql unit vs integration coverage.** `HhmmSql.ToMinutes` is a pure C# string builder; unit tests don't need DuckDB. But the output is correct *only if* DuckDB evaluates it the expected way. Add one integration test per expression (`ToMinutes`, `ActiveMinutesExpr`) that executes the generated SQL against known HHMM values and asserts the numeric result.
3. **`GetSummaryAsync` previous-period query shape.** Either two queries in one session (cleaner, simple), or one UNION ALL query with a `period` column (one round-trip, slightly more SQL). Recommendation: **two queries** — the DuckDB connection pool makes this cheap and the code is clearer.
4. **`SankeyResponse.GetByAgentTypeAsync` — top-flights-per-service filtering.** The current C# code has a somewhat convoluted `Where` chain that effectively accepts all links. Verify the SQL rewrite preserves the same node/link set by snapshot-testing against the EF-era baseline, not by translating the C# literally.
5. **Filter service `/options` endpoint output shape.** Need to verify current behaviour (distinct airlines + services + handled_by + flights?) — the plan will inspect `FilterService.cs` in detail. Likely a single multi-dimension response returning distinct values per dimension; one `SELECT DISTINCT ... UNION ALL` per dimension, or several separate queries in one session.
6. **Records endpoint ordering.** Plan should verify the current sort key (probably `ServiceDate DESC, RowId`) and preserve it via `ORDER BY` in SQL.
7. **Dead `DbContextOptions` or `DbContextFactory` references in `Program.cs`.** Grep during implementation — the DI cleanup must remove every reference, not just the explicit `AddDbContext` call.
