using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class FilterService : SqlBaseQueryService
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

        // Build shared WHERE fragment + params for airport filter
        string where;
        List<DuckDBParameter> baseParms;
        if (airports.Length > 0)
        {
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            where = $"loc_name IN ({string.Join(",", names)})";
            baseParms = airports.Select((a, i) => new DuckDBParameter($"a{i}", a)).ToList();
        }
        else
        {
            where = "loc_name = $a0";
            baseParms = new List<DuckDBParameter> { new("a0", airport) };
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

    private static async Task<List<string>> DistinctAsync(
        DuckDBConnection conn, string path, string col, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT DISTINCT {col} FROM '{path}' WHERE {where} AND {col} IS NOT NULL ORDER BY 1";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var list = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            list.Add(reader.GetString(0));
        return list;
    }

    private static async Task<(DateOnly?, DateOnly?)> MinMaxDateAsync(
        DuckDBConnection conn, string path, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT MIN(service_date), MAX(service_date) FROM '{path}' WHERE {where}";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct) || reader.IsDBNull(0)) return (null, null);
        var min = DateOnly.FromDateTime(reader.GetDateTime(0));
        var max = DateOnly.FromDateTime(reader.GetDateTime(1));
        return (min, max);
    }
}
