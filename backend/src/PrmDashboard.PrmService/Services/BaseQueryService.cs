using System.Text;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

/// <summary>
/// Abstract base for PRM query services after the DuckDB migration.
/// Holds the DuckDB session factory and parquet-path helper, and exposes a
/// pure static <see cref="BuildWhereClause"/> that turns
/// <see cref="PrmFilterParams"/> into a parameterised SQL WHERE fragment.
///
/// The airport filter is required (middleware enforces non-empty
/// <c>?airport=...</c> and validates against the JWT claim); other filters
/// are optional and omitted from the fragment when absent.
/// </summary>
public abstract class BaseQueryService
{
    protected readonly IDuckDbContext _duck;
    protected readonly TenantParquetPaths _paths;

    protected BaseQueryService(IDuckDbContext duck, TenantParquetPaths paths)
    {
        _duck = duck;
        _paths = paths;
    }

    /// <summary>
    /// Builds a parameterised SQL WHERE fragment from the filter params.
    /// Single airport uses equality (<c>loc_name = $a0</c>); multiple airports
    /// use an IN clause (<c>loc_name IN ($a0,$a1,...)</c>). All other filters
    /// are optional and omitted when absent.
    /// </summary>
    /// <remarks>
    /// Parameters emitted — callers must embed these names in their SQL and
    /// re-bind the returned <see cref="DuckDBParameter"/>s onto their command:
    /// <list type="bullet">
    /// <item><description>Airport: <c>$a0</c> (single) or <c>$a0, $a1, ...</c> (multi)</description></item>
    /// <item><description>Date range: <c>$df</c>, <c>$dt</c></description></item>
    /// <item><description>Airline: <c>$al0, $al1, ...</c></description></item>
    /// <item><description>Service: <c>$sv0, $sv1, ...</c></description></item>
    /// <item><description>Handled-by: <c>$hb0, $hb1, ...</c></description></item>
    /// <item><description>Flight: <c>$f</c></description></item>
    /// <item><description>Agent no: <c>$ag</c></description></item>
    /// </list>
    /// </remarks>
    protected static (string Sql, IReadOnlyList<DuckDBParameter> Parameters) BuildWhereClause(
        PrmFilterParams filters)
    {
        var sb = new StringBuilder();
        var parms = new List<DuckDBParameter>();

        var airports = filters.AirportList;
        if (airports is { Length: > 1 })
        {
            // Multiple airports — use IN clause for efficiency.
            var names = airports.Select((_, i) => $"$a{i}").ToArray();
            sb.Append("loc_name IN (").Append(string.Join(",", names)).Append(')');
            for (var i = 0; i < airports.Length; i++)
                parms.Add(new DuckDBParameter($"a{i}", airports[i]));
        }
        else
        {
            // Single airport (or empty/null): equality is cleaner than a
            // one-element IN clause and produces identical rows. The plan's
            // original pattern used `{ Length: > 0 }` → IN; we split to give
            // the planner a direct equality when possible.
            var airportValue = airports is { Length: 1 } ? airports[0] : (filters.Airport ?? "");
            sb.Append("loc_name = $a0");
            parms.Add(new DuckDBParameter("a0", airportValue));
        }

        if (filters.DateFrom.HasValue)
        {
            sb.Append(" AND service_date >= $df");
            parms.Add(new DuckDBParameter("df", filters.DateFrom.Value.ToDateTime(TimeOnly.MinValue)));
        }
        if (filters.DateTo.HasValue)
        {
            sb.Append(" AND service_date <= $dt");
            parms.Add(new DuckDBParameter("dt", filters.DateTo.Value.ToDateTime(TimeOnly.MinValue)));
        }

        AppendInClause(sb, parms, "airline",        filters.AirlineList,   "al");
        AppendInClause(sb, parms, "service",        filters.ServiceList,   "sv");
        AppendInClause(sb, parms, "prm_agent_type", filters.HandledByList, "hb");

        if (!string.IsNullOrEmpty(filters.Flight))
        {
            sb.Append(" AND flight = $f");
            parms.Add(new DuckDBParameter("f", filters.Flight));
        }
        if (!string.IsNullOrEmpty(filters.AgentNo))
        {
            sb.Append(" AND agent_no = $ag");
            parms.Add(new DuckDBParameter("ag", filters.AgentNo));
        }

        return (sb.ToString(), parms);
    }

    private static void AppendInClause(
        StringBuilder sb, List<DuckDBParameter> parms,
        string col, string[]? values, string prefix)
    {
        if (values is not { Length: > 0 }) return;
        var names = values.Select((_, i) => $"${prefix}{i}").ToArray();
        sb.Append($" AND {col} IN (").Append(string.Join(",", names)).Append(')');
        for (var i = 0; i < values.Length; i++)
            parms.Add(new DuckDBParameter($"{prefix}{i}", values[i]));
    }

    /// <summary>
    /// Returns the start date of the previous comparison period. The previous
    /// period has the same length as the current period (inclusive of both
    /// endpoints) and ends the day before the current period starts — i.e.
    /// <c>prev_end = from.AddDays(-1)</c>.
    /// </summary>
    protected static DateOnly GetPrevPeriodStart(DateOnly from, DateOnly to)
    {
        var days = to.DayNumber - from.DayNumber + 1;
        return from.AddDays(-days);
    }

    /// <summary>Escapes single quotes in filesystem path literals for use in DuckDB SQL strings.</summary>
    protected static string EscapePath(string path) => path.Replace("'", "''");

    /// <summary>
    /// Resolves the parquet path for the given tenant, verifies the file exists, and
    /// returns it ready for SQL interpolation (single quotes escaped). Throws
    /// <see cref="TenantParquetNotFoundException"/> if the file is absent — caught by
    /// <c>ExceptionHandlerMiddleware</c> and translated to 404. Combines what would
    /// otherwise be three boilerplate lines per service method into one helper.
    /// </summary>
    protected string ResolveTenantParquet(string tenantSlug)
    {
        var path = _paths.TenantPrmServices(tenantSlug);
        if (!File.Exists(path))
            throw new TenantParquetNotFoundException(tenantSlug, path);
        return EscapePath(path);
    }

    /// <summary>
    /// Runs a <c>SELECT DISTINCT {col} FROM '{path}' WHERE {where} AND {col} IS NOT NULL ORDER BY 1</c>
    /// query on the given connection, returning the distinct values as a list. Re-creates
    /// <see cref="DuckDBParameter"/> instances per call (they're stateful — cannot be shared across commands).
    /// </summary>
    protected static async Task<List<string>> DistinctAsync(
        DuckDBConnection conn, string path, string col, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct = default)
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

    /// <summary>
    /// Runs a <c>SELECT MIN(service_date), MAX(service_date)</c> query with the given WHERE fragment,
    /// returning both dates as <see cref="DateOnly"/>, or <c>(null, null)</c> when no rows match.
    /// </summary>
    protected static async Task<(DateOnly? Min, DateOnly? Max)> MinMaxDateAsync(
        DuckDBConnection conn, string path, string where,
        IReadOnlyList<DuckDBParameter> parms, CancellationToken ct = default)
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

    /// <summary>
    /// Runs a "grouped count with percentage" query pattern — dedup by id via
    /// <c>ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id)</c>, then
    /// <c>SELECT {col} AS label, COUNT(*) AS count, ROUND(100.0 * COUNT(*) / total, 2) AS pct</c>
    /// grouped by <paramref name="col"/>. Optionally skips rows where the grouped
    /// column is NULL or empty. Optional <paramref name="limit"/> applies a
    /// <c>LIMIT $limit</c> clause.
    /// </summary>
    /// <param name="col">Column name to group by — trusted input, interpolated directly into SQL.</param>
    /// <param name="skipNull">When true, filters out rows where <c>{col}</c> is NULL or empty string.</param>
    /// <param name="limit">Optional LIMIT applied after ORDER BY count DESC.</param>
    protected async Task<List<(string Label, int Count, double Pct)>> GroupCountAsync(
        string tenantSlug, PrmFilterParams filters, string col,
        bool skipNull = false, int? limit = null, CancellationToken ct = default)
    {
        var path = ResolveTenantParquet(tenantSlug);
        var (where, parms) = BuildWhereClause(filters);
        var nullGuard = skipNull ? $" AND {col} IS NOT NULL AND {col} != ''" : "";

        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1{nullGuard}
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT {col} AS label,
                   COUNT(*)::INT AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped
            GROUP BY {col}
            ORDER BY cnt DESC
            {(limit.HasValue ? "LIMIT $limit" : "")}";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        if (limit.HasValue) cmd.Parameters.Add(new DuckDBParameter("limit", limit.Value));

        var items = new List<(string Label, int Count, double Pct)>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add((
                Label: reader.GetString(0),
                Count: Convert.ToInt32(reader.GetValue(1)),
                Pct: Convert.ToDouble(reader.GetValue(2))));
        }
        return items;
    }

    // --- Test shims ---
    // BuildWhereClause and GetPrevPeriodStart are protected static so they
    // aren't directly callable from xUnit. These internal wrappers allow the
    // test project (granted access via InternalsVisibleTo) to exercise the
    // pure logic without needing a concrete subclass.

    internal static (string Sql, IReadOnlyList<DuckDBParameter> Parameters) BuildWhereClauseForTest(
        PrmFilterParams filters) => BuildWhereClause(filters);

    internal static DateOnly GetPrevPeriodStartForTest(DateOnly from, DateOnly to) =>
        GetPrevPeriodStart(from, to);
}
