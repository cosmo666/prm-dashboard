using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.PrmService.Services;

/// <summary>
/// Abstract base for all PRM query services. Provides tenant DB access
/// and shared filter-building logic.
/// </summary>
public abstract class BaseQueryService
{
    protected readonly TenantDbContextFactory _factory;

    protected BaseQueryService(TenantDbContextFactory factory)
    {
        _factory = factory;
    }

    /// <summary>
    /// Builds a filtered IQueryable from the tenant DbContext.
    /// Airport is required; all other filters are optional.
    /// </summary>
    protected IQueryable<PrmServiceRecord> ApplyFilters(
        TenantDbContext db,
        PrmFilterParams filters)
    {
        // Airport: CSV (`DEL,BOM`) or single (`DEL`). Middleware has already
        // verified every airport is permitted for the authenticated user.
        var airports = filters.AirportList;
        var query = airports is { Length: > 0 }
            ? db.PrmServices.AsNoTracking().Where(r => airports.Contains(r.LocName))
            : db.PrmServices.AsNoTracking().Where(r => r.LocName == filters.Airport);

        if (filters.DateFrom.HasValue)
            query = query.Where(r => r.ServiceDate >= filters.DateFrom.Value);

        if (filters.DateTo.HasValue)
            query = query.Where(r => r.ServiceDate <= filters.DateTo.Value);

        // Multi-value CSV fields — use Contains() when 1+ value is present.
        // Use the parsed *List accessors (never the raw string) so callers
        // don't need to worry about splitting and trimming.
        var airlines = filters.AirlineList;
        if (airlines is { Length: > 0 })
            query = query.Where(r => airlines.Contains(r.Airline));

        var services = filters.ServiceList;
        if (services is { Length: > 0 })
            query = query.Where(r => services.Contains(r.Service));

        var handledBy = filters.HandledByList;
        if (handledBy is { Length: > 0 })
            query = query.Where(r => handledBy.Contains(r.PrmAgentType));

        // Single-value exact match fields (no multi-select UI for these yet).
        if (!string.IsNullOrEmpty(filters.Flight))
            query = query.Where(r => r.Flight == filters.Flight);

        if (!string.IsNullOrEmpty(filters.AgentNo))
            query = query.Where(r => r.AgentNo == filters.AgentNo);

        return query;
    }

    /// <summary>
    /// Calculates the start date of the previous comparison period.
    /// The previous period has the same length as the current period and ends
    /// the day before the current period starts.
    /// </summary>
    protected DateOnly GetPrevPeriodStart(DateOnly from, DateOnly to)
    {
        int days = to.DayNumber - from.DayNumber + 1;
        return from.AddDays(-days);
    }
}
