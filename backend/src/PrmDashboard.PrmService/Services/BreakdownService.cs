using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class BreakdownService : BaseQueryService
{
    private readonly ILogger<BreakdownService> _logger;

    public BreakdownService(TenantDbContextFactory factory, ILogger<BreakdownService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Matrix: months x service types, COUNT DISTINCT id per cell.
    /// </summary>
    public async Task<ServiceTypeMatrixResponse> GetByServiceTypeAsync(
        string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        var serviceTypes = deduped.Select(r => r.Service).Distinct().OrderBy(s => s).ToList();

        var rows = deduped
            .GroupBy(r => new { r.ServiceDate.Year, r.ServiceDate.Month })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .Select(g =>
            {
                var counts = new Dictionary<string, int>();
                foreach (var st in serviceTypes)
                    counts[st] = g.Count(r => r.Service == st);

                return new ServiceTypeMatrixRow(
                    $"{g.Key.Year}-{g.Key.Month:D2}",
                    counts,
                    g.Count());
            })
            .ToList();

        _logger.LogInformation("Service type matrix for {Slug}/{Airport}: {Types} types x {Months} months",
            tenantSlug, filters.Airport, serviceTypes.Count, rows.Count);

        return new ServiceTypeMatrixResponse(serviceTypes, rows);
    }

    /// <summary>
    /// Sankey: AgentType -> Service -> top flights. Dedup by id (first row).
    /// </summary>
    public async Task<SankeyResponse> GetByAgentTypeAsync(
        string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        var nodes = new Dictionary<string, int>();
        var links = new Dictionary<(string, string), int>();

        foreach (var row in deduped)
        {
            string agentType = row.PrmAgentType;
            string service = row.Service;
            string flight = row.Flight;

            // Accumulate node values
            nodes[agentType] = nodes.GetValueOrDefault(agentType) + 1;
            nodes[service] = nodes.GetValueOrDefault(service) + 1;
            nodes[flight] = nodes.GetValueOrDefault(flight) + 1;

            // AgentType -> Service link
            var link1 = (agentType, service);
            links[link1] = links.GetValueOrDefault(link1) + 1;

            // Service -> Flight link
            var link2 = (service, flight);
            links[link2] = links.GetValueOrDefault(link2) + 1;
        }

        // Keep only top flights per service to avoid Sankey clutter
        var topFlightLinks = links
            .Where(kv => !nodes.ContainsKey(kv.Key.Item1) ||
                deduped.Any(r => r.Service == kv.Key.Item1 && r.Flight == kv.Key.Item2))
            .Where(kv => deduped.Any(r => r.PrmAgentType == kv.Key.Item1) ||
                deduped.Any(r => r.Service == kv.Key.Item1))
            .OrderByDescending(kv => kv.Value)
            .ToList();

        var sankeyNodes = nodes.Select(kv => new SankeyNode(kv.Key, kv.Value)).ToList();
        var sankeyLinks = topFlightLinks.Select(kv => new SankeyLink(kv.Key.Item1, kv.Key.Item2, kv.Value)).ToList();

        _logger.LogInformation("Sankey breakdown for {Slug}/{Airport}: {Nodes} nodes, {Links} links",
            tenantSlug, filters.Airport, sankeyNodes.Count, sankeyLinks.Count);

        return new SankeyResponse(sankeyNodes, sankeyLinks);
    }

    /// <summary>
    /// Breakdown by airline — group by Airline, COUNT DISTINCT id, percentage.
    /// </summary>
    public async Task<BreakdownResponse> GetByAirlineAsync(
        string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        int total = deduped.Count;
        var items = deduped
            .GroupBy(r => r.Airline)
            .Select(g => new BreakdownItem(
                g.Key,
                g.Count(),
                total > 0 ? Math.Round((double)g.Count() / total * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .ToList();

        _logger.LogInformation("Airline breakdown for {Slug}/{Airport}: {Count} airlines",
            tenantSlug, filters.Airport, items.Count);

        return new BreakdownResponse(items);
    }

    /// <summary>
    /// Breakdown by POS location — skip nulls/empty, COUNT DISTINCT id.
    /// </summary>
    public async Task<BreakdownResponse> GetByLocationAsync(
        string tenantSlug, PrmFilterParams filters)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        var withLocation = deduped.Where(r => !string.IsNullOrEmpty(r.PosLocation)).ToList();
        int total = withLocation.Count;

        var items = withLocation
            .GroupBy(r => r.PosLocation!)
            .Select(g => new BreakdownItem(
                g.Key,
                g.Count(),
                total > 0 ? Math.Round((double)g.Count() / total * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .ToList();

        _logger.LogInformation("Location breakdown for {Slug}/{Airport}: {Count} locations",
            tenantSlug, filters.Airport, items.Count);

        return new BreakdownResponse(items);
    }

    /// <summary>
    /// Route breakdown — group by Departure+Arrival (skip nulls), top N.
    /// </summary>
    public async Task<RouteBreakdownResponse> GetByRouteAsync(
        string tenantSlug, PrmFilterParams filters, int limit = 10)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);
        var query = ApplyFilters(db, filters);

        var deduped = await query
            .GroupBy(r => r.Id)
            .Select(g => g.OrderBy(r => r.RowId).First())
            .ToListAsync();

        var withRoute = deduped
            .Where(r => !string.IsNullOrEmpty(r.Departure) && !string.IsNullOrEmpty(r.Arrival))
            .ToList();
        int total = withRoute.Count;

        var items = withRoute
            .GroupBy(r => new { r.Departure, r.Arrival })
            .Select(g => new RouteItem(
                g.Key.Departure!,
                g.Key.Arrival!,
                g.Count(),
                total > 0 ? Math.Round((double)g.Count() / total * 100, 2) : 0))
            .OrderByDescending(x => x.Count)
            .Take(limit)
            .ToList();

        _logger.LogInformation("Route breakdown for {Slug}/{Airport}: {Count} routes",
            tenantSlug, filters.Airport, items.Count);

        return new RouteBreakdownResponse(items);
    }
}
