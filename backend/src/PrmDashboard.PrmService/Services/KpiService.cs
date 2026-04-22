using DuckDB.NET.Data;
using PrmDashboard.PrmService.Sql;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class KpiService : BaseQueryService
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
            SELECT prm_agent_type, COUNT(*)::INT AS cnt
            FROM deduped
            GROUP BY prm_agent_type
            ORDER BY cnt DESC";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

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
            SELECT COUNT(*)::INT AS provided, COALESCE(SUM(requested), 0)::INT AS requested
            FROM deduped";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

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
                ) t WHERE rn = 1
            ),
            durations AS (
                SELECT id, SUM({activeExpr}) AS d FROM filtered GROUP BY id
            )
            SELECT
                (SELECT COUNT(*)::INT FROM deduped) AS total_prm,
                (SELECT COUNT(DISTINCT agent_no)::INT FROM filtered
                    WHERE prm_agent_type = 'SELF' AND agent_no IS NOT NULL AND agent_no != '') AS self_agents,
                (SELECT COUNT(DISTINCT agent_no)::INT FROM filtered
                    WHERE prm_agent_type != 'SELF' AND agent_no IS NOT NULL AND agent_no != '') AS outsourced_agents,
                (SELECT COUNT(DISTINCT service_date)::INT FROM filtered) AS distinct_days,
                (SELECT ROUND(AVG(d), 2) FROM durations) AS avg_duration,
                (SELECT SUM(requested)::INT FROM deduped) AS total_requested";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

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
