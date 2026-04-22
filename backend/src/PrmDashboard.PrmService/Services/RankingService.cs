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
                SELECT SUM(CASE WHEN no_show_flag != 'N' OR no_show_flag IS NULL THEN 1 ELSE 0 END)::INT AS total_serviced
                FROM deduped
            )
            SELECT d.flight,
                   SUM(CASE WHEN d.no_show_flag != 'N' OR d.no_show_flag IS NULL THEN 1 ELSE 0 END)::INT AS serviced,
                   COUNT(*)::INT AS requested,
                   CASE WHEN (SELECT total_serviced FROM totals) > 0
                        THEN ROUND(100.0 * SUM(CASE WHEN d.no_show_flag != 'N' OR d.no_show_flag IS NULL THEN 1 ELSE 0 END)::INT
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
                Label: reader.GetString(0),
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
