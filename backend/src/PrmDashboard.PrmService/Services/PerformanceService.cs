using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class PerformanceService : BaseQueryService
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
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH durations AS (
                SELECT id, SUM({activeExpr})::DOUBLE AS d
                FROM '{path}' WHERE {where}
                GROUP BY id
            )
            SELECT
                SUM(CASE WHEN d >=  0 AND d <  15 THEN 1 ELSE 0 END)::INT AS b015,
                SUM(CASE WHEN d >= 15 AND d <  30 THEN 1 ELSE 0 END)::INT AS b1530,
                SUM(CASE WHEN d >= 30 AND d <  45 THEN 1 ELSE 0 END)::INT AS b3045,
                SUM(CASE WHEN d >= 45 AND d <  60 THEN 1 ELSE 0 END)::INT AS b4560,
                SUM(CASE WHEN d >= 60 AND d <  90 THEN 1 ELSE 0 END)::INT AS b6090,
                SUM(CASE WHEN d >= 90             THEN 1 ELSE 0 END)::INT AS b90p,
                COUNT(*)::INT AS total,
                ROUND(AVG(d), 2) AS avg_d,
                ROUND(quantile_cont(d, 0.5), 2) AS p50,
                ROUND(quantile_cont(d, 0.9), 2) AS p90
            FROM durations";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct) || Convert.ToInt32(reader.GetValue(6)) == 0)
            return new DurationDistributionResponse(new List<DurationBucket>(), 0, 0, 0);

        var b = new int[]
        {
            Convert.ToInt32(reader.GetValue(0)), Convert.ToInt32(reader.GetValue(1)),
            Convert.ToInt32(reader.GetValue(2)), Convert.ToInt32(reader.GetValue(3)),
            Convert.ToInt32(reader.GetValue(4)), Convert.ToInt32(reader.GetValue(5))
        };
        int total = Convert.ToInt32(reader.GetValue(6));
        double avg = reader.IsDBNull(7) ? 0 : Convert.ToDouble(reader.GetValue(7));
        double p50 = reader.IsDBNull(8) ? 0 : Convert.ToDouble(reader.GetValue(8));
        double p90 = reader.IsDBNull(9) ? 0 : Convert.ToDouble(reader.GetValue(9));

        var labels = new[] { "0-15", "15-30", "30-45", "45-60", "60-90", "90+" };
        var buckets = labels.Select((l, i) => new DurationBucket(l, b[i],
            total > 0 ? Math.Round(100.0 * b[i] / total, 2) : 0)).ToList();

        _logger.LogInformation("Duration distribution for {Slug}/{Airport}: {Count} services",
            tenantSlug, filters.Airport, total);
        return new DurationDistributionResponse(buckets, p50, p90, avg);
    }

    public async Task<DurationStatsResponse> GetDurationStatsAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH durations AS (
                SELECT id, SUM({activeExpr})::DOUBLE AS d
                FROM '{path}' WHERE {where}
                GROUP BY id
            )
            SELECT
                COUNT(*)::INT AS n,
                ROUND(MIN(d), 2),
                ROUND(MAX(d), 2),
                ROUND(AVG(d), 2),
                ROUND(quantile_cont(d, 0.5), 2),
                ROUND(quantile_cont(d, 0.9), 2),
                ROUND(quantile_cont(d, 0.95), 2)
            FROM durations";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

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
        var path = ResolveTenantParquet(tenantSlug);
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
                   COUNT(*)::INT AS total,
                   SUM(CASE WHEN no_show_flag = 'N' THEN 1 ELSE 0 END)::INT AS no_shows,
                   CASE WHEN COUNT(*) > 0
                        THEN ROUND(100.0 * SUM(CASE WHEN no_show_flag = 'N' THEN 1 ELSE 0 END) / COUNT(*), 2)
                        ELSE 0.0 END AS rate
            FROM deduped
            GROUP BY airline
            ORDER BY no_shows DESC";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

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

        _logger.LogInformation("No-show analysis for {Slug}/{Airport}: {Count} airlines",
            tenantSlug, filters.Airport, items.Count);
        return new NoShowResponse(items);
    }

    public async Task<PauseAnalysisResponse> GetPauseAnalysisAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);
        var toMinPaused = HhmmSql.ToMinutes("paused_at");
        var toMinNext = HhmmSql.ToMinutes("next_start");

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // Query 1: scalar totals + avg pause gap via LEAD window function
        await using var statsCmd = conn.CreateCommand();
        statsCmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            gaps AS (
                SELECT id, paused_at,
                       LEAD(start_time) OVER (PARTITION BY id ORDER BY row_id) AS next_start
                FROM filtered
            )
            SELECT
                (SELECT COUNT(DISTINCT id)::INT FROM filtered) AS total_services,
                (SELECT COUNT(DISTINCT id)::INT FROM filtered WHERE paused_at IS NOT NULL) AS paused_services,
                (SELECT ROUND(AVG({toMinNext} - {toMinPaused}), 2) FROM gaps
                    WHERE paused_at IS NOT NULL AND next_start IS NOT NULL AND next_start > paused_at) AS avg_pause";
        foreach (var p in parms) statsCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        int totalServices = 0, pausedServices = 0;
        double avgPause = 0;
        await using (var r = await statsCmd.ExecuteReaderAsync(ct))
        {
            if (await r.ReadAsync(ct))
            {
                totalServices  = Convert.ToInt32(r.GetValue(0));
                pausedServices = Convert.ToInt32(r.GetValue(1));
                avgPause       = r.IsDBNull(2) ? 0 : Convert.ToDouble(r.GetValue(2));
            }
        }

        double pauseRate = totalServices > 0
            ? Math.Round(100.0 * pausedServices / totalServices, 2) : 0;

        // Query 2: breakdown by service type for paused services only
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
            SELECT service,
                   COUNT(*)::INT AS cnt,
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

        _logger.LogInformation("Pause analysis for {Slug}/{Airport}: {Paused}/{Total} paused",
            tenantSlug, filters.Airport, pausedServices, totalServices);
        return new PauseAnalysisResponse(pausedServices, pauseRate, avgPause, byType);
    }

    public async Task<DurationByAgentTypeResponse> GetDurationByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);
        var activeExpr = HhmmSql.ActiveMinutesExpr("start_time", "paused_at", "end_time");

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH filtered AS (SELECT * FROM '{path}' WHERE {where}),
            per_service AS (
                SELECT id, MIN(row_id) AS min_row_id, SUM({activeExpr})::DOUBLE AS d
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
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var buckets = new Dictionary<string, Dictionary<string, double>>();
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var svc = r.GetString(0);
                var at  = r.GetString(1);
                var d   = Convert.ToDouble(r.GetValue(2));
                if (!buckets.TryGetValue(svc, out var dict)) buckets[svc] = dict = new Dictionary<string, double>();
                dict[at] = d;
            }
        }

        var types = buckets.Keys.OrderBy(k => k).ToList();
        var selfAvg = types.Select(t => buckets[t].GetValueOrDefault("SELF")).ToList();
        var outsourcedAvg = types.Select(t => buckets[t].GetValueOrDefault("OUTSOURCED")).ToList();

        _logger.LogInformation("Duration by agent type for {Slug}/{Airport}: {Types} service types",
            tenantSlug, filters.Airport, types.Count);
        return new DurationByAgentTypeResponse(types, selfAvg, outsourcedAvg);
    }
}
