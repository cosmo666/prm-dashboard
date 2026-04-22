using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class BreakdownService : BaseQueryService
{
    private readonly ILogger<BreakdownService> _logger;

    public BreakdownService(IDuckDbContext duck, TenantParquetPaths paths, ILogger<BreakdownService> logger)
        : base(duck, paths)
    {
        _logger = logger;
    }

    public async Task<BreakdownResponse> GetByAirlineAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var rows = await GroupCountAsync(tenantSlug, filters, "airline", skipNull: false, ct: ct);
        var items = rows.Select(r => new BreakdownItem(r.Label, r.Count, r.Pct)).ToList();
        _logger.LogInformation("Airline breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new BreakdownResponse(items);
    }

    public async Task<BreakdownResponse> GetByLocationAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var rows = await GroupCountAsync(tenantSlug, filters, "pos_location", skipNull: true, ct: ct);
        var items = rows.Select(r => new BreakdownItem(r.Label, r.Count, r.Pct)).ToList();
        _logger.LogInformation("Location breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new BreakdownResponse(items);
    }

    public async Task<RouteBreakdownResponse> GetByRouteAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
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
                    AND departure IS NOT NULL AND departure != ''
                    AND arrival   IS NOT NULL AND arrival   != ''
            ),
            t AS (SELECT COUNT(*) AS total FROM deduped)
            SELECT departure, arrival, COUNT(*)::INT AS cnt,
                   CASE WHEN (SELECT total FROM t) > 0
                        THEN ROUND(100.0 * COUNT(*) / (SELECT total FROM t), 2)
                        ELSE 0.0 END AS pct
            FROM deduped
            GROUP BY departure, arrival
            ORDER BY cnt DESC
            LIMIT $limit";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        cmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var items = new List<RouteItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            items.Add(new RouteItem(
                Departure: reader.GetString(0),
                Arrival: reader.GetString(1),
                Count: Convert.ToInt32(reader.GetValue(2)),
                Percentage: Convert.ToDouble(reader.GetValue(3))));
        }
        _logger.LogInformation("Route breakdown for {Slug}/{Airport}: {Count}", tenantSlug, filters.Airport, items.Count);
        return new RouteBreakdownResponse(items);
    }

    public async Task<ServiceTypeMatrixResponse> GetByServiceTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // 1. Distinct service types
        await using var typesCmd = conn.CreateCommand();
        typesCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT DISTINCT service FROM deduped ORDER BY service";
        foreach (var p in parms) typesCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var types = new List<string>();
        await using (var r = await typesCmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) types.Add(r.GetString(0));

        // 2. Matrix: month × service → count
        await using var matCmd = conn.CreateCommand();
        matCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT strftime(service_date, '%Y-%m') AS ym, service, COUNT(*)::INT AS cnt
            FROM deduped
            GROUP BY ym, service
            ORDER BY ym";
        foreach (var p in parms) matCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var byMonth = new Dictionary<string, Dictionary<string, int>>();
        await using (var r = await matCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var ym = r.GetString(0);
                var sv = r.GetString(1);
                var cnt = Convert.ToInt32(r.GetValue(2));
                if (!byMonth.TryGetValue(ym, out var dict))
                    byMonth[ym] = dict = new Dictionary<string, int>();
                dict[sv] = cnt;
            }
        }

        var rows = byMonth.OrderBy(kv => kv.Key).Select(kv =>
        {
            var counts = new Dictionary<string, int>();
            foreach (var t in types) counts[t] = kv.Value.GetValueOrDefault(t);
            var total = counts.Values.Sum();
            return new ServiceTypeMatrixRow(kv.Key, counts, total);
        }).ToList();

        _logger.LogInformation("Service type matrix for {Slug}/{Airport}: {Types}×{Months}",
            tenantSlug, filters.Airport, types.Count, rows.Count);
        return new ServiceTypeMatrixResponse(types, rows);
    }

    public async Task<SankeyResponse> GetByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT prm_agent_type, service, flight FROM deduped";
        foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));

        var nodes = new Dictionary<string, int>();
        var links = new Dictionary<(string, string), int>();

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var at = reader.GetString(0);
            var sv = reader.GetString(1);
            var fl = reader.GetString(2);
            nodes[at] = nodes.GetValueOrDefault(at) + 1;
            nodes[sv] = nodes.GetValueOrDefault(sv) + 1;
            nodes[fl] = nodes.GetValueOrDefault(fl) + 1;
            var k1 = (at, sv);
            var k2 = (sv, fl);
            links[k1] = links.GetValueOrDefault(k1) + 1;
            links[k2] = links.GetValueOrDefault(k2) + 1;
        }

        var sankeyNodes = nodes.Select(kv => new SankeyNode(kv.Key, kv.Value)).ToList();
        var sankeyLinks = links.OrderByDescending(kv => kv.Value)
            .Select(kv => new SankeyLink(kv.Key.Item1, kv.Key.Item2, kv.Value)).ToList();

        _logger.LogInformation("Sankey breakdown for {Slug}/{Airport}: {Nodes} nodes, {Links} links",
            tenantSlug, filters.Airport, sankeyNodes.Count, sankeyLinks.Count);
        return new SankeyResponse(sankeyNodes, sankeyLinks);
    }

    public async Task<AgentServiceMatrixResponse> GetAgentServiceMatrixAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
    {
        var path = EscapePath(_paths.TenantPrmServices(tenantSlug));
        var (where, parms) = BuildWhereClause(filters);

        await using var session = await _duck.AcquireAsync(ct);
        var conn = session.Connection;

        // 1. Top agents by volume
        await using var agentsCmd = conn.CreateCommand();
        agentsCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
                    AND agent_no IS NOT NULL AND agent_no != ''
            )
            SELECT agent_no, ANY_VALUE(agent_name) AS name, COUNT(*)::INT AS cnt
            FROM deduped
            GROUP BY agent_no
            ORDER BY cnt DESC
            LIMIT $limit";
        foreach (var p in parms) agentsCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        agentsCmd.Parameters.Add(new DuckDBParameter("limit", limit));

        var agentNos = new List<string>();
        var agentNames = new List<string>();
        await using (var r = await agentsCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                agentNos.Add(r.GetString(0));
                agentNames.Add(r.IsDBNull(1) ? r.GetString(0) : r.GetString(1));
            }
        }

        if (agentNos.Count == 0)
            return new AgentServiceMatrixResponse(agentNos, agentNames, new List<string>(), new List<List<int>>());

        // 2. Service types (within the filtered + deduped set)
        await using var typesCmd = conn.CreateCommand();
        typesCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
            )
            SELECT DISTINCT service FROM deduped ORDER BY service";
        foreach (var p in parms) typesCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        var types = new List<string>();
        await using (var r = await typesCmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) types.Add(r.GetString(0));

        // 3. Matrix values — filter to top agents only
        var agentNosList = agentNos.Select((_, i) => $"$ag{i}").ToArray();
        await using var matCmd = conn.CreateCommand();
        matCmd.CommandText = $@"
            WITH deduped AS (
                SELECT * FROM (
                    SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
                    FROM '{path}' WHERE {where}
                ) t WHERE rn = 1
                    AND agent_no IN ({string.Join(",", agentNosList)})
            )
            SELECT agent_no, service, COUNT(*)::INT AS cnt
            FROM deduped GROUP BY agent_no, service";
        foreach (var p in parms) matCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
        for (var i = 0; i < agentNos.Count; i++) matCmd.Parameters.Add(new DuckDBParameter($"ag{i}", agentNos[i]));

        var counts = new Dictionary<(string, string), int>();
        await using (var r = await matCmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
                counts[(r.GetString(0), r.GetString(1))] = Convert.ToInt32(r.GetValue(2));
        }

        var values = agentNos.Select(a => types.Select(t => counts.GetValueOrDefault((a, t), 0)).ToList()).ToList();

        _logger.LogInformation("Agent-service matrix for {Slug}/{Airport}: {A}×{T}",
            tenantSlug, filters.Airport, agentNos.Count, types.Count);
        return new AgentServiceMatrixResponse(agentNos, agentNames, types, values);
    }

}
