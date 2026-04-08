using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class KpiService : BaseQueryService
{
    private readonly ILogger<KpiService> _logger;

    public KpiService(TenantDbContextFactory factory, ILogger<KpiService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Total PRM count, agent counts, avg per agent per day, avg duration,
    /// fulfillment %, and previous-period comparisons.
    /// </summary>
    public async Task<KpiSummaryResponse> GetSummaryAsync(
        string tenantSlug,
        PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var rows = await query.ToListAsync();
        var currentMetrics = ComputeSummaryMetrics(rows, filters);

        // Previous period comparison (only when date range is specified)
        int prevTotalPrm = 0;
        double prevAvgPerAgentPerDay = 0;
        double prevAvgDuration = 0;

        if (filters.DateFrom.HasValue && filters.DateTo.HasValue)
        {
            var prevStart = GetPrevPeriodStart(filters.DateFrom.Value, filters.DateTo.Value);
            var prevEnd = filters.DateFrom.Value.AddDays(-1);

            var prevFilters = new PrmFilterParams
            {
                Airport = filters.Airport,
                DateFrom = prevStart,
                DateTo = prevEnd,
                Airline = filters.Airline,
                Service = filters.Service,
                HandledBy = filters.HandledBy,
                Flight = filters.Flight,
                AgentNo = filters.AgentNo
            };

            var prevRows = await ApplyFilters(db, prevFilters).ToListAsync();
            var prevMetrics = ComputeSummaryMetrics(prevRows, prevFilters);
            prevTotalPrm = prevMetrics.TotalPrm;
            prevAvgPerAgentPerDay = prevMetrics.AvgPerAgentPerDay;
            prevAvgDuration = prevMetrics.AvgDuration;
        }

        _logger.LogInformation(
            "KPI summary for {Slug}/{Airport}: {TotalPrm} services",
            tenantSlug, filters.Airport, currentMetrics.TotalPrm);

        return new KpiSummaryResponse(
            TotalPrm: currentMetrics.TotalPrm,
            TotalPrmPrevPeriod: prevTotalPrm,
            TotalAgents: currentMetrics.TotalAgents,
            AgentsSelf: currentMetrics.AgentsSelf,
            AgentsOutsourced: currentMetrics.AgentsOutsourced,
            AvgServicesPerAgentPerDay: currentMetrics.AvgPerAgentPerDay,
            AvgServicesPrevPeriod: prevAvgPerAgentPerDay,
            AvgDurationMinutes: currentMetrics.AvgDuration,
            AvgDurationPrevPeriod: prevAvgDuration,
            FulfillmentPct: currentMetrics.FulfillmentPct
        );
    }

    /// <summary>
    /// Groups services by PrmAgentType (SELF / OUTSOURCED) after dedup by id.
    /// </summary>
    public async Task<HandlingDistributionResponse> GetHandlingDistributionAsync(
        string tenantSlug,
        PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        // Dedup: take first row per id, then group by agent type
        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        var groups = deduped
            .GroupBy(r => r.PrmAgentType)
            .OrderByDescending(g => g.Count())
            .ToList();

        _logger.LogInformation(
            "Handling distribution for {Slug}/{Airport}: {Groups} types",
            tenantSlug, filters.Airport, groups.Count);

        return new HandlingDistributionResponse(
            Labels: groups.Select(g => g.Key).ToList(),
            Values: groups.Select(g => g.Count()).ToList()
        );
    }

    /// <summary>
    /// Requested vs provided KPIs with fulfillment and walk-up rates.
    /// </summary>
    public async Task<RequestedVsProvidedKpiResponse> GetRequestedVsProvidedAsync(
        string tenantSlug,
        PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        // Dedup: first row per id for requested count
        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        int totalProvided = deduped.Count;
        int totalRequested = deduped.Sum(r => r.Requested);
        int providedAgainstRequested = Math.Min(totalProvided, totalRequested);

        double fulfillmentRate = totalRequested > 0
            ? Math.Round((double)totalProvided / totalRequested * 100, 2)
            : 0;

        // Walk-ups are services provided beyond what was requested
        int walkUps = Math.Max(0, totalProvided - totalRequested);
        double walkUpRate = totalProvided > 0
            ? Math.Round((double)walkUps / totalProvided * 100, 2)
            : 0;

        _logger.LogInformation(
            "Requested vs provided for {Slug}/{Airport}: {Requested} req, {Provided} prov",
            tenantSlug, filters.Airport, totalRequested, totalProvided);

        return new RequestedVsProvidedKpiResponse(
            TotalRequested: totalRequested,
            TotalProvided: totalProvided,
            ProvidedAgainstRequested: providedAgainstRequested,
            FulfillmentRate: fulfillmentRate,
            WalkUpRate: walkUpRate
        );
    }

    private record SummaryMetrics(
        int TotalPrm,
        int TotalAgents,
        int AgentsSelf,
        int AgentsOutsourced,
        double AvgPerAgentPerDay,
        double AvgDuration,
        double FulfillmentPct);

    private static SummaryMetrics ComputeSummaryMetrics(
        List<Shared.Models.PrmServiceRecord> rows,
        PrmFilterParams filters)
    {
        if (rows.Count == 0)
            return new SummaryMetrics(0, 0, 0, 0, 0, 0, 0);

        // Distinct service count (dedup by id)
        int totalPrm = rows.Select(r => r.Id).Distinct().Count();

        // Agent counts — distinct AgentNo split by self vs outsourced
        var selfAgents = rows
            .Where(r => r.PrmAgentType == "SELF" && !string.IsNullOrEmpty(r.AgentNo))
            .Select(r => r.AgentNo)
            .Distinct()
            .Count();

        var outsourcedAgents = rows
            .Where(r => r.PrmAgentType != "SELF" && !string.IsNullOrEmpty(r.AgentNo))
            .Select(r => r.AgentNo)
            .Distinct()
            .Count();

        int totalAgents = selfAgents + outsourcedAgents;

        // Avg services per agent per day
        int totalDays = ComputeTotalDays(rows, filters);
        double avgPerAgentPerDay = totalAgents > 0 && totalDays > 0
            ? Math.Round((double)totalPrm / totalAgents / totalDays, 2)
            : 0;

        // Avg duration: sum active minutes per id, then average
        double avgDuration = ComputeAvgDuration(rows);

        // Fulfillment: provided / requested
        var deduped = rows
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToList();

        int totalRequested = deduped.Sum(r => r.Requested);
        double fulfillmentPct = totalRequested > 0
            ? Math.Round((double)totalPrm / totalRequested * 100, 2)
            : 0;

        return new SummaryMetrics(
            totalPrm, totalAgents, selfAgents, outsourcedAgents,
            avgPerAgentPerDay, avgDuration, fulfillmentPct);
    }

    private static int ComputeTotalDays(
        List<Shared.Models.PrmServiceRecord> rows,
        PrmFilterParams filters)
    {
        if (filters.DateFrom.HasValue && filters.DateTo.HasValue)
            return filters.DateTo.Value.DayNumber - filters.DateFrom.Value.DayNumber + 1;

        // Fallback: count distinct service dates in the data
        return rows.Select(r => r.ServiceDate).Distinct().Count();
    }

    private static double ComputeAvgDuration(
        List<Shared.Models.PrmServiceRecord> rows)
    {
        // Group by id, sum active minutes per service, then average
        var durations = rows
            .GroupBy(r => r.Id)
            .Select(g => g.Sum(r =>
                TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .ToList();

        return durations.Count > 0
            ? Math.Round(durations.Average(), 2)
            : 0;
    }
}
