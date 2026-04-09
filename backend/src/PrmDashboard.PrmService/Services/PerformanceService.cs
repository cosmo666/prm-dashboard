using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class PerformanceService : BaseQueryService
{
    private readonly ILogger<PerformanceService> _logger;

    public PerformanceService(TenantDbContextFactory factory, ILogger<PerformanceService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Duration distribution — bucket durations into ranges, return p50/p90/avg.
    /// </summary>
    // TODO(perf): materializes filtered rows into memory then aggregates in C#.
    // Acceptable for POC scale (~15k rows per tenant). For production, rewrite as
    // raw SQL with ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) for dedup.
    public async Task<DurationDistributionResponse> GetDurationDistributionAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var durations = await ComputeDurationsAsync(tenantSlug, filters, ct);

        if (durations.Count == 0)
        {
            return new DurationDistributionResponse(
                new List<DurationBucket>(), 0, 0, 0);
        }

        var sorted = durations.OrderBy(d => d).ToList();
        double avg = Math.Round(sorted.Average(), 2);
        double p50 = Percentile(sorted, 50);
        double p90 = Percentile(sorted, 90);

        var bucketDefs = new (string Label, double Min, double Max)[]
        {
            ("0-15", 0, 15),
            ("15-30", 15, 30),
            ("30-45", 30, 45),
            ("45-60", 45, 60),
            ("60-90", 60, 90),
            ("90+", 90, double.MaxValue)
        };

        int total = sorted.Count;
        var buckets = bucketDefs.Select(b =>
        {
            int count = sorted.Count(d => d >= b.Min && d < b.Max);
            double pct = total > 0 ? Math.Round((double)count / total * 100, 2) : 0;
            return new DurationBucket(b.Label, count, pct);
        }).ToList();

        _logger.LogInformation("Duration distribution for {Slug}/{Airport}: {Count} services",
            tenantSlug, filters.Airport, total);

        return new DurationDistributionResponse(buckets, p50, p90, avg);
    }

    /// <summary>
    /// Duration stats — min/max/avg/median/p90/p95.
    /// </summary>
    // TODO(perf): materializes filtered rows into memory then aggregates in C#.
    // Acceptable for POC scale (~15k rows per tenant). For production, rewrite as
    // raw SQL with ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) for dedup.
    public async Task<DurationStatsResponse> GetDurationStatsAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var durations = await ComputeDurationsAsync(tenantSlug, filters, ct);

        if (durations.Count == 0)
            return new DurationStatsResponse(0, 0, 0, 0, 0, 0);

        var sorted = durations.OrderBy(d => d).ToList();

        return new DurationStatsResponse(
            Min: Math.Round(sorted.First(), 2),
            Max: Math.Round(sorted.Last(), 2),
            Avg: Math.Round(sorted.Average(), 2),
            Median: Percentile(sorted, 50),
            P90: Percentile(sorted, 90),
            P95: Percentile(sorted, 95)
        );
    }

    /// <summary>
    /// No-show analysis — group by airline, count total + no-shows, calc rate.
    /// </summary>
    public async Task<NoShowResponse> GetNoShowsAsync(
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

        var items = deduped
            .GroupBy(r => r.Airline)
            .Select(g =>
            {
                int total = g.Count();
                int noShows = g.Count(r => r.NoShowFlag == "N");
                double rate = total > 0 ? Math.Round((double)noShows / total * 100, 2) : 0;
                return new NoShowItem(g.Key, total, noShows, rate);
            })
            .OrderByDescending(x => x.NoShows)
            .ToList();

        _logger.LogInformation("No-show analysis for {Slug}/{Airport}: {Count} airlines",
            tenantSlug, filters.Airport, items.Count);

        return new NoShowResponse(items);
    }

    /// <summary>
    /// Pause analysis — count paused services, avg pause duration, breakdown by service type.
    /// </summary>
    // TODO(perf): materializes filtered rows into memory then aggregates in C#.
    // Acceptable for POC scale (~15k rows per tenant). For production, rewrite as
    // raw SQL with ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) for dedup.
    public async Task<PauseAnalysisResponse> GetPauseAnalysisAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        var rows = await query.OrderBy(r => r.Id).ThenBy(r => r.RowId).ToListAsync(ct);

        // Count distinct services that have at least one paused row
        var pausedServiceIds = rows
            .Where(r => r.PausedAt.HasValue)
            .Select(r => r.Id)
            .Distinct()
            .ToHashSet();

        int totalServices = rows.Select(r => r.Id).Distinct().Count();
        int totalPaused = pausedServiceIds.Count;
        double pauseRate = totalServices > 0
            ? Math.Round((double)totalPaused / totalServices * 100, 2) : 0;

        // Avg pause duration: for paused rows, pause duration = next segment's start - pausedAt
        var pauseDurations = new List<double>();
        var rowsByService = rows.GroupBy(r => r.Id);
        foreach (var group in rowsByService)
        {
            var segments = group.OrderBy(r => r.RowId).ToList();
            for (int i = 0; i < segments.Count - 1; i++)
            {
                int? pausedAt = segments[i].PausedAt;
                if (pausedAt.HasValue)
                {
                    double pauseMinutes = TimeHelpers.HhmmToMinutes(segments[i + 1].StartTime)
                        - TimeHelpers.HhmmToMinutes(pausedAt.Value);
                    if (pauseMinutes > 0)
                        pauseDurations.Add(pauseMinutes);
                }
            }
        }

        double avgPauseDuration = pauseDurations.Count > 0
            ? Math.Round(pauseDurations.Average(), 2) : 0;

        // Breakdown by service type (deduped by id)
        var dedupedPaused = rows
            .Where(r => pausedServiceIds.Contains(r.Id))
            .GroupBy(r => r.Id)
            .Select(g => g.First())
            .ToList();

        var byServiceType = dedupedPaused
            .GroupBy(r => r.Service)
            .Select(g => new BreakdownItem(
                g.Key,
                g.Count(),
                totalPaused > 0 ? Math.Round((double)g.Count() / totalPaused * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .ToList();

        _logger.LogInformation("Pause analysis for {Slug}/{Airport}: {Paused}/{Total} paused",
            tenantSlug, filters.Airport, totalPaused, totalServices);

        return new PauseAnalysisResponse(totalPaused, pauseRate, avgPauseDuration, byServiceType);
    }

    /// <summary>
    /// Avg duration grouped by prm_agent_type (SELF/OUTSOURCED) per service type.
    /// </summary>
    public async Task<DurationByAgentTypeResponse> GetDurationByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);
        var rows = await query.ToListAsync(ct);

        var perService = rows
            .GroupBy(r => r.Id)
            .Select(g =>
            {
                var first = g.OrderBy(r => r.RowId).First();
                var duration = g.Sum(r =>
                    TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime));
                return new { first.PrmAgentType, first.Service, Duration = duration };
            })
            .ToList();

        var serviceTypes = perService
            .Select(r => r.Service)
            .Distinct()
            .OrderBy(s => s)
            .ToList();

        var selfAvg = serviceTypes.Select(s =>
        {
            var items = perService.Where(r => r.Service == s && r.PrmAgentType == "SELF").ToList();
            return items.Count > 0 ? Math.Round(items.Average(r => r.Duration), 1) : 0.0;
        }).ToList();

        var outsourcedAvg = serviceTypes.Select(s =>
        {
            var items = perService.Where(r => r.Service == s && r.PrmAgentType == "OUTSOURCED").ToList();
            return items.Count > 0 ? Math.Round(items.Average(r => r.Duration), 1) : 0.0;
        }).ToList();

        _logger.LogInformation("Duration by agent type for {Slug}/{Airport}: {Types} service types",
            tenantSlug, filters.Airport, serviceTypes.Count);

        return new DurationByAgentTypeResponse(serviceTypes, selfAvg, outsourcedAvg);
    }

    /// <summary>
    /// Computes duration per distinct service id (sum of active minutes per id).
    /// </summary>
    private async Task<List<double>> ComputeDurationsAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);
        var rows = await query.ToListAsync(ct);

        return rows
            .GroupBy(r => r.Id)
            .Select(g => g.Sum(r =>
                TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .ToList();
    }

    /// <summary>
    /// Nearest-rank percentile on a pre-sorted list.
    /// </summary>
    private static double Percentile(List<double> sorted, int percentile)
    {
        if (sorted.Count == 0) return 0;
        int index = (int)Math.Ceiling(percentile / 100.0 * sorted.Count) - 1;
        index = Math.Clamp(index, 0, sorted.Count - 1);
        return Math.Round(sorted[index], 2);
    }
}
