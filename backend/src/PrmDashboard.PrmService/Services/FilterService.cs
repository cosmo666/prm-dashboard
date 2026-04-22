using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class FilterService : BaseQueryService
{
    private readonly ILogger<FilterService> _logger;

    public FilterService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<FilterService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<FilterOptionsResponse> GetOptionsAsync(
        string tenantSlug, string airport, CancellationToken ct = default)
    {
        var airports = airport.Split(
            ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // Build airport WHERE fragment. Pattern matches BaseQueryService.BuildWhereClause:
        // multiple airports → IN clause; single (or empty) → equality.
        string where;
        List<DuckDBParameter> baseParms;
        if (airports.Length > 1)
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            where = $"loc_name IN ({string.Join(",", names)})";
            baseParms = airports.Select((a, i) => new DuckDBParameter($"a{i}", a)).ToList();
        }
        else
        {
            var airportValue = airports.Length == 1 ? airports[0] : airport;
            where = "loc_name = $a0";
            baseParms = new List<DuckDBParameter> { new("a0", airportValue) };
        }

        var airlines  = await DistinctAsync(conn, path, "airline",        where, baseParms, ct);
        var services  = await DistinctAsync(conn, path, "service",        where, baseParms, ct);
        var handledBy = await DistinctAsync(conn, path, "prm_agent_type", where, baseParms, ct);
        var flights   = await DistinctAsync(conn, path, "flight",         where, baseParms, ct);

        (DateOnly? minDate, DateOnly? maxDate) = await MinMaxDateAsync(conn, path, where, baseParms, ct);

        _logger.LogInformation(
            "Filter options for {Slug}/{Airport}: {Airlines} airlines, {Services} services",
            tenantSlug, airport, airlines.Count, services.Count);

        return new FilterOptionsResponse(airlines, services, handledBy, flights, minDate, maxDate);
    }
}
