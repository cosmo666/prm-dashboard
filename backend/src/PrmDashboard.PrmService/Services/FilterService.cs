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
    /// Returns distinct filter option values for the given airport.
    /// Used to populate dropdown menus in the dashboard filter bar.
    /// </summary>
    public async Task<FilterOptionsResponse> GetOptionsAsync(
        string tenantSlug,
        string airport)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug);

        var query = db.PrmServices.AsNoTracking()
            .Where(r => r.LocName == airport);

        var airlines = await query
            .Select(r => r.Airline)
            .Distinct()
            .OrderBy(a => a)
            .ToListAsync();

        var services = await query
            .Select(r => r.Service)
            .Distinct()
            .OrderBy(s => s)
            .ToListAsync();

        var handledBy = await query
            .Select(r => r.PrmAgentType)
            .Distinct()
            .OrderBy(h => h)
            .ToListAsync();

        var flights = await query
            .Select(r => r.Flight)
            .Distinct()
            .OrderBy(f => f)
            .ToListAsync();

        var minDate = await query.MinAsync(r => (DateOnly?)r.ServiceDate);
        var maxDate = await query.MaxAsync(r => (DateOnly?)r.ServiceDate);

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
