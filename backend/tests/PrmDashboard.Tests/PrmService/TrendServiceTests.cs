using DuckDB.NET.Data;
using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.Data;
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

    /// <summary>
    /// Regression guard: DuckDB's <c>/</c> on integer literals returns DOUBLE,
    /// and <c>CAST(23.59 AS INTEGER)</c> rounds to 24 rather than truncating to
    /// 23. An earlier revision used <c>CAST(start_time / 100 AS INTEGER)</c>
    /// which would bucket <c>start_time=2359</c> into a non-existent hour=24
    /// cell. The service now uses <c>//</c> (integer division) — this test
    /// would fail if that regresses.
    /// </summary>
    [Fact]
    public async Task GetHourlyAsync_StartTime2359_BucketsAsHour23NotHour24()
    {
        // Fixture data has no rows at hour ≥ 22 that would exercise the rounding
        // boundary. Build a one-off tenant parquet with a single row at 2359 so
        // we can pin the exact cell.
        var root = Path.Combine(Path.GetTempPath(), $"trend-hourly-boundary-{Guid.NewGuid():N}");
        var tenant = "boundary";
        Directory.CreateDirectory(Path.Combine(root, tenant));
        try
        {
            var options = Microsoft.Extensions.Options.Options.Create(
                new DataPathOptions { Root = root, PoolSize = 2 });
            var paths = new TenantParquetPaths(options);
            // DuckDbContext doesn't implement IDisposable — pooled in-memory
            // connections are released at process exit (same pattern as
            // PrmFixtureBuilder.DisposeAsync).
            var duck = new DuckDbContext(options);

            var target = paths.TenantPrmServices(tenant).Replace("'", "''");
            await using var conn = new DuckDBConnection("DataSource=:memory:");
            await conn.OpenAsync();
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
                    CREATE TABLE prm_services AS SELECT
                        1 AS row_id, 1 AS id, 'AI999' AS flight, 999 AS flight_number,
                        'Agent Late' AS agent_name, 'A999' AS agent_no, 'Pax' AS passenger_name,
                        'SELF' AS prm_agent_type, 2359 AS start_time, NULL::INTEGER AS paused_at,
                        2359 AS end_time, 'WCHR' AS service, NULL::VARCHAR AS seat_number,
                        NULL::VARCHAR AS pos_location, 'Y' AS no_show_flag, 'DEL' AS loc_name,
                        'DEL' AS arrival, 'AI' AS airline, 'BOM' AS departure, 1 AS requested,
                        DATE '2026-03-01' AS service_date";
                await cmd.ExecuteNonQueryAsync();
            }
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"COPY prm_services TO '{target}' (FORMAT 'parquet')";
                await cmd.ExecuteNonQueryAsync();
            }

            var svc = new TrendService(duck, paths, NullLogger<TrendService>.Instance);
            var r = await svc.GetHourlyAsync(tenant, new PrmFilterParams { Airport = "DEL" });

            // 2359 must bucket to hour 23 (truncation), not hour 24 (rounding).
            // If the regression returns, the one seeded row is silently dropped:
            // every cell would be 0, so we assert hour 23 has exactly 1.
            var hour23Total = r.Values.Sum(row => row[23]);
            Assert.Equal(1, hour23Total);
        }
        finally
        {
            try { Directory.Delete(root, recursive: true); } catch { /* best-effort */ }
        }
    }
}
