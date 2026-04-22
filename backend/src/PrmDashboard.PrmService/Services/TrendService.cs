using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class TrendService : BaseQueryService
{
    private readonly ILogger<TrendService> _logger;

    public TrendService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<TrendService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<DailyTrendResponse> GetDailyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT service_date, COUNT(DISTINCT id) AS cnt
            FROM '{path}'
            WHERE {where}
            GROUP BY service_date
            ORDER BY service_date";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var dates = new List<string>();
        var values = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            dates.Add(DateOnly.FromDateTime(reader.GetDateTime(0)).ToString("yyyy-MM-dd"));
            values.Add(Convert.ToInt32(reader.GetValue(1)));
        }

        double average = values.Count > 0 ? Math.Round(values.Average(), 2) : 0;
        _logger.LogInformation("Daily trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, dates.Count);
        return new DailyTrendResponse(dates, values, average);
    }

    public async Task<MonthlyTrendResponse> GetMonthlyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            SELECT strftime(service_date, '%Y-%m') AS ym, COUNT(DISTINCT id) AS cnt
            FROM '{path}'
            WHERE {where}
            GROUP BY ym
            ORDER BY ym";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var months = new List<string>();
        var values = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            months.Add(reader.GetString(0));
            values.Add(Convert.ToInt32(reader.GetValue(1)));
        }

        _logger.LogInformation("Monthly trend for {Slug}/{Airport}: {Months} months",
            tenantSlug, filters.Airport, months.Count);
        return new MonthlyTrendResponse(months, values);
    }

    public async Task<HourlyHeatmapResponse> GetHourlyAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        // DuckDB dayofweek: Sun=0..Sat=6. Map to Mon=0..Sun=6 via ((dow + 6) % 7).
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT ((CAST(strftime(service_date, '%w') AS INTEGER) + 6) % 7) AS dow,
                   CAST(start_time / 100 AS INTEGER) AS hr,
                   COUNT(*) AS cnt
            FROM deduped
            WHERE start_time / 100 BETWEEN 0 AND 23
            GROUP BY dow, hr";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var values = new List<List<int>>();
        for (var d = 0; d < 7; d++) values.Add(Enumerable.Repeat(0, 24).ToList());

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var dow = Convert.ToInt32(reader.GetValue(0));
            var hr  = Convert.ToInt32(reader.GetValue(1));
            var cnt = Convert.ToInt32(reader.GetValue(2));
            if (dow is >= 0 and < 7 && hr is >= 0 and < 24) values[dow][hr] = cnt;
        }

        _logger.LogInformation("Hourly heatmap for {Slug}/{Airport} built", tenantSlug, filters.Airport);
        return new HourlyHeatmapResponse(
            new List<string> { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" },
            Enumerable.Range(0, 24).ToList(),
            values);
    }

    public async Task<RequestedVsProvidedTrendResponse> GetRequestedVsProvidedAsync(
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
            SELECT service_date, COUNT(*) AS provided, SUM(requested)::INT AS requested
            FROM deduped
            GROUP BY service_date
            ORDER BY service_date";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var dates = new List<string>();
        var provided = new List<int>();
        var requested = new List<int>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            dates.Add(DateOnly.FromDateTime(reader.GetDateTime(0)).ToString("yyyy-MM-dd"));
            provided.Add(Convert.ToInt32(reader.GetValue(1)));
            requested.Add(Convert.ToInt32(reader.GetValue(2)));
        }

        _logger.LogInformation("Requested vs provided trend for {Slug}/{Airport}: {Days} days",
            tenantSlug, filters.Airport, dates.Count);
        return new RequestedVsProvidedTrendResponse(dates, provided, requested);
    }
}
