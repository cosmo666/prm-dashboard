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
        if (airports.Length > 1)
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            where = $"id = $pid AND loc_name IN ({string.Join(",", names)})";
            parms = airports.Select((a, i) => new DuckDBParameter($"a{i}", a)).ToList();
            parms.Add(new DuckDBParameter("pid", prmId));
        }
        else
        {
            var airportValue = airports.Length == 1 ? airports[0] : airport;
            where = "id = $pid AND loc_name = $a0";
            parms = new List<DuckDBParameter>
            {
                new("a0", airportValue), new("pid", prmId)
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
