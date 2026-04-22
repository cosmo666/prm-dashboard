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
        // DuckDbContext doesn't implement IDisposable/IAsyncDisposable — its
        // pooled in-memory DuckDB connections are released at process exit.
        try { Directory.Delete(RootPath, recursive: true); } catch { /* best-effort */ }
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
        var n = System.Convert.ToInt64(await cmd.ExecuteScalarAsync());
        Assert.Equal(PrmFixtureBuilder.SeedRows().Count, (int)n);
    }
}
