using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class TrendService : BaseQueryService
{
    private readonly ILogger<TrendService> _logger;

    public TrendService(TenantDbContextFactory factory, ILogger<TrendService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Daily service count trend — COUNT DISTINCT id per day.
    /// </summary>
    public async Task<DailyTrendResponse> GetDailyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        var daily = await query
            .GroupBy(r => r.ServiceDate)
            .Select(g => new { Date = g.Key, Count = g.Select(r => r.Id).Distinct().Count() })
            .OrderBy(x => x.Date)
            .ToListAsync(ct);

        var dates = daily.Select(d => d.Date.ToString("yyyy-MM-dd")).ToList();
        var values = daily.Select(d => d.Count).ToList();
        double average = values.Count > 0 ? Math.Round(values.Average(), 2) : 0;

        _logger.LogInformation("Daily trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, dates.Count);

        return new DailyTrendResponse(dates, values, average);
    }

    /// <summary>
    /// Monthly service count trend — COUNT DISTINCT id per year-month.
    /// </summary>
    public async Task<MonthlyTrendResponse> GetMonthlyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
        var query = ApplyFilters(db, filters);

        var monthly = await query
            .GroupBy(r => new { r.ServiceDate.Year, r.ServiceDate.Month })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                Count = g.Select(r => r.Id).Distinct().Count()
            })
            .OrderBy(x => x.Year).ThenBy(x => x.Month)
            .ToListAsync(ct);

        var months = monthly.Select(m => $"{m.Year}-{m.Month:D2}").ToList();
        var values = monthly.Select(m => m.Count).ToList();

        _logger.LogInformation("Monthly trend for {Slug}/{Airport}: {Months} months",
            tenantSlug, filters.Airport, months.Count);

        return new MonthlyTrendResponse(months, values);
    }

    /// <summary>
    /// Heatmap: 7 days (Mon-Sun) x 24 hours, count distinct ids per cell.
    /// Hour derived from StartTime / 100.
    /// </summary>
    public async Task<HourlyHeatmapResponse> GetHourlyAsync(
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

        var days = new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
        var hours = Enumerable.Range(0, 24).ToList();

        // Initialize 7x24 grid
        var values = new List<List<int>>();
        for (int d = 0; d < 7; d++)
            values.Add(Enumerable.Repeat(0, 24).ToList());

        foreach (var row in deduped)
        {
            int dayIndex = DayIndex(row.ServiceDate.DayOfWeek);
            int hour = row.StartTime / 100;
            if (hour >= 0 && hour < 24)
                values[dayIndex][hour]++;
        }

        _logger.LogInformation("Hourly heatmap for {Slug}/{Airport}: {Records} deduped records",
            tenantSlug, filters.Airport, deduped.Count);

        return new HourlyHeatmapResponse(days.ToList(), hours, values);
    }

    /// <summary>
    /// Daily trend of provided (distinct id) vs requested (sum of Requested, deduped by id).
    /// </summary>
    public async Task<RequestedVsProvidedTrendResponse> GetRequestedVsProvidedAsync(
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

        var daily = deduped
            .GroupBy(r => r.ServiceDate)
            .OrderBy(g => g.Key)
            .Select(g => new
            {
                Date = g.Key.ToString("yyyy-MM-dd"),
                Provided = g.Count(),
                Requested = g.Sum(r => r.Requested)
            })
            .ToList();

        _logger.LogInformation("Requested vs provided trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, daily.Count);

        return new RequestedVsProvidedTrendResponse(
            daily.Select(d => d.Date).ToList(),
            daily.Select(d => d.Provided).ToList(),
            daily.Select(d => d.Requested).ToList()
        );
    }

    /// <summary>
    /// Maps DayOfWeek to Mon=0..Sun=6 index.
    /// </summary>
    private static int DayIndex(DayOfWeek dow) => dow switch
    {
        DayOfWeek.Monday => 0,
        DayOfWeek.Tuesday => 1,
        DayOfWeek.Wednesday => 2,
        DayOfWeek.Thursday => 3,
        DayOfWeek.Friday => 4,
        DayOfWeek.Saturday => 5,
        DayOfWeek.Sunday => 6,
        _ => 0
    };
}
