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
        var query = db.PrmServices.AsNoTracking()
            .Where(r => r.LocName == filters.Airport);

        if (filters.DateFrom.HasValue)
            query = query.Where(r => r.ServiceDate >= filters.DateFrom.Value);

        if (filters.DateTo.HasValue)
            query = query.Where(r => r.ServiceDate <= filters.DateTo.Value);

        if (!string.IsNullOrEmpty(filters.Airline))
            query = query.Where(r => r.Airline == filters.Airline);

        if (!string.IsNullOrEmpty(filters.Service))
            query = query.Where(r => r.Service == filters.Service);

        if (!string.IsNullOrEmpty(filters.HandledBy))
            query = query.Where(r => r.PrmAgentType == filters.HandledBy);

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
