using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Services;

public class FilterService : BaseQueryService
{
    private readonly ILogger<FilterService> _logger;

    public FilterService(TenantDbContextFactory factory, ILogger<FilterService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Returns distinct filter option values for the given airport(s).
    /// Accepts a single airport code or a CSV (e.g. "DEL,BOM") so the dashboard
    /// can populate dropdowns when the user picks multiple airports together.
    /// </summary>
    public async Task<FilterOptionsResponse> GetOptionsAsync(
        string tenantSlug,
        string airport,
        CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);

        var airports = airport.Split(
            ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var query = airports.Length > 0
            ? db.PrmServices.AsNoTracking().Where(r => airports.Contains(r.LocName))
            : db.PrmServices.AsNoTracking().Where(r => r.LocName == airport);

        var airlines = await query
            .Select(r => r.Airline)
            .Distinct()
            .OrderBy(a => a)
            .ToListAsync(ct);

        var services = await query
            .Select(r => r.Service)
            .Distinct()
            .OrderBy(s => s)
            .ToListAsync(ct);

        var handledBy = await query
            .Select(r => r.PrmAgentType)
            .Distinct()
            .OrderBy(h => h)
            .ToListAsync(ct);

        var flights = await query
            .Select(r => r.Flight)
            .Distinct()
            .OrderBy(f => f)
            .ToListAsync(ct);

        var minDate = await query.MinAsync(r => (DateOnly?)r.ServiceDate, ct);
        var maxDate = await query.MaxAsync(r => (DateOnly?)r.ServiceDate, ct);

        _logger.LogInformation(
            "Filter options for {Slug}/{Airport}: {Airlines} airlines, {Services} services",
            tenantSlug, airport, airlines.Count, services.Count);

        return new FilterOptionsResponse(
            Airlines: airlines,
            Services: services,
            HandledBy: handledBy,
            Flights: flights,
            MinDate: minDate,
            MaxDate: maxDate
        );
    }
}
