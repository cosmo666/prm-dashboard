using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class RankingService : BaseQueryService
{
    private readonly ILogger<RankingService> _logger;

    public RankingService(TenantDbContextFactory factory, ILogger<RankingService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Top airlines by distinct service count.
    /// </summary>
    public async Task<RankingsResponse> GetTopAirlinesAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        // Materialize first; EF Core 8 can't translate GroupBy().Select(g => g.OrderBy().First()).
        var rows = await query.ToListAsync(ct);
        var deduped = rows
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToList();

        int total = deduped.Count;
        var items = deduped
            .GroupBy(r => r.Airline)
            .Select(g => new RankingItem(
                g.Key,
                g.Count(),
                total > 0 ? Math.Round((double)g.Count() / total * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .Take(limit)
            .ToList();

        _logger.LogInformation("Top airlines for {Slug}/{Airport}: {Count} items",
            tenantSlug, filters.Airport, items.Count);

        return new RankingsResponse(items);
    }

    /// <summary>
    /// Top flights by distinct service count.
    /// </summary>
    public async Task<FlightRankingsResponse> GetTopFlightsAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        // Materialize first; EF Core 8 can't translate GroupBy().Select(g => g.OrderBy().First()).
        var rows = await query.ToListAsync(ct);
        var deduped = rows
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToList();

        // NoShowFlag == "N" marks a no-show (passenger requested, didn't show up).
        // Serviced = requested minus no-shows.
        int totalServiced = deduped.Count(r => r.NoShowFlag != "N");
        var items = deduped
            .GroupBy(r => r.Flight)
            .Select(g =>
            {
                int requested = g.Count();
                int serviced = g.Count(r => r.NoShowFlag != "N");
                return new FlightRankingItem(
                    g.Key,
                    serviced,
                    requested,
                    totalServiced > 0 ? Math.Round((double)serviced / totalServiced * 100, 2) : 0);
            })
            .OrderByDescending(x => x.ServicedCount)
            .Take(limit)
            .ToList();

        _logger.LogInformation("Top flights for {Slug}/{Airport}: {Count} items",
            tenantSlug, filters.Airport, items.Count);

        return new FlightRankingsResponse(items);
    }

    /// <summary>
    /// Agent rankings: PRM count, avg duration, top service/airline, days active.
    /// </summary>
    // TODO(perf): materializes filtered rows into memory then aggregates in C#.
    // Acceptable for POC scale (~15k rows per tenant). For production, rewrite as
    // raw SQL with ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) for dedup.
    public async Task<AgentRankingsResponse> GetTopAgentsAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        var rows = await query.ToListAsync(ct);

        // Group all rows by AgentNo (skip nulls)
        var agentGroups = rows
            .Where(r => !string.IsNullOrEmpty(r.AgentNo))
            .GroupBy(r => r.AgentNo!)
            .ToList();

        var items = agentGroups.Select(g =>
        {
            // Dedup services by id within this agent's rows
            var serviceIds = g.Select(r => r.Id).Distinct().ToList();
            int prmCount = serviceIds.Count;

            // Avg duration: sum active minutes per id, then average
            var durations = g
                .GroupBy(r => r.Id)
                .Select(sg => sg.Sum(r =>
                    TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
                .ToList();
            double avgDuration = durations.Count > 0 ? Math.Round(durations.Average(), 2) : 0;

            // Top service and airline by frequency (deduped by id)
            var dedupedRows = g.GroupBy(r => r.Id).Select(sg => sg.First()).ToList();
            var topServiceGroup = dedupedRows
                .GroupBy(r => r.Service)
                .OrderByDescending(sg => sg.Count())
                .FirstOrDefault();
            string topService = topServiceGroup?.Key ?? "";
            int topServiceCount = topServiceGroup?.Count() ?? 0;
            string topAirline = dedupedRows
                .GroupBy(r => r.Airline)
                .OrderByDescending(sg => sg.Count())
                .Select(sg => sg.Key)
                .FirstOrDefault() ?? "";

            int daysActive = g.Select(r => r.ServiceDate).Distinct().Count();
            string agentName = g.Select(r => r.AgentName).FirstOrDefault(n => !string.IsNullOrEmpty(n)) ?? "";

            double avgPerDay = daysActive > 0 ? Math.Round((double)prmCount / daysActive, 2) : 0;
            return new { AgentNo = g.Key, AgentName = agentName, PrmCount = prmCount, AvgDuration = avgDuration, TopService = topService, TopServiceCount = topServiceCount, TopAirline = topAirline, DaysActive = daysActive, AvgPerDay = avgPerDay };
        })
        .OrderByDescending(x => x.PrmCount)
        .Take(limit)
        .Select((x, i) => new AgentRankingItem(
            i + 1, x.AgentNo, x.AgentName, x.PrmCount,
            x.AvgDuration, x.TopService, x.TopServiceCount, x.TopAirline, x.DaysActive, x.AvgPerDay))
        .ToList();

        _logger.LogInformation("Agent rankings for {Slug}/{Airport}: {Count} agents",
            tenantSlug, filters.Airport, items.Count);

        return new AgentRankingsResponse(items);
    }

    /// <summary>
    /// All service types by distinct count (no limit).
    /// </summary>
    public async Task<RankingsResponse> GetTopServicesAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        // Materialize first; EF Core 8 can't translate GroupBy().Select(g => g.OrderBy().First()).
        var rows = await query.ToListAsync(ct);
        var deduped = rows
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToList();

        int total = deduped.Count;
        var items = deduped
            .GroupBy(r => r.Service)
            .Select(g => new RankingItem(
                g.Key,
                g.Count(),
                total > 0 ? Math.Round((double)g.Count() / total * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .ToList();

        _logger.LogInformation("Service rankings for {Slug}/{Airport}: {Count} types",
            tenantSlug, filters.Airport, items.Count);

        return new RankingsResponse(items);
    }
}
