using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Extensions;

namespace PrmDashboard.PrmService.Services;

public class RecordService : BaseQueryService
{
    private readonly ILogger<RecordService> _logger;

    public RecordService(TenantDbContextFactory factory, ILogger<RecordService> logger)
        : base(factory)
    {
        _logger = logger;
    }

    /// <summary>
    /// Paginated list of PRM records with sorting support.
    /// Deduped by id — returns the first row per service.
    /// </summary>
    public async Task<PaginatedResponse<PrmRecordDto>> GetRecordsAsync(
        string tenantSlug, PrmFilterParams filters,
        int page = 1, int pageSize = 20, string sort = "service_date:desc",
        CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);

        // Dedup: find the MIN(row_id) per distinct id from filtered set.
        // EF Core 8 cannot translate .GroupBy(id).Select(g => g.OrderBy(...).First()) directly,
        // but it can translate GroupBy → Min, so we fetch the canonical row ids and
        // join back via Contains (which becomes a WHERE IN subquery).
        var canonicalRowIds = ApplyFilters(db, filters)
            .GroupBy(r => r.Id)
            .Select(g => g.Min(r => r.RowId));

        var deduped = db.PrmServices.AsNoTracking()
            .Where(r => canonicalRowIds.Contains(r.RowId));

        // Apply sorting on the deduped set
        deduped = sort switch
        {
            "start_time:asc" => deduped.OrderBy(r => r.StartTime),
            "start_time:desc" => deduped.OrderByDescending(r => r.StartTime),
            "service_date:asc" => deduped.OrderBy(r => r.ServiceDate).ThenBy(r => r.StartTime),
            "service_date:desc" => deduped.OrderByDescending(r => r.ServiceDate).ThenByDescending(r => r.StartTime),
            _ => deduped.OrderByDescending(r => r.ServiceDate).ThenByDescending(r => r.StartTime)
        };

        int totalCount = await deduped.CountAsync(ct);
        int totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling((double)totalCount / pageSize);

        var items = await deduped
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new PrmRecordDto(
                r.RowId, r.Id, r.Flight, r.AgentName, r.PassengerName,
                r.PrmAgentType, r.StartTime, r.PausedAt, r.EndTime,
                r.Service, r.SeatNumber, r.PosLocation, r.NoShowFlag,
                r.LocName, r.Arrival, r.Airline, r.Departure, r.Requested,
                r.ServiceDate))
            .ToListAsync(ct);

        _logger.LogInformation("Records for {Slug}/{Airport}: page {Page}/{TotalPages}, {Count} items",
            tenantSlug, filters.Airport, page, totalPages, items.Count);

        return new PaginatedResponse<PrmRecordDto>(items, totalCount, page, pageSize, totalPages);
    }

    /// <summary>
    /// All segments (rows) for a given PRM service id, ordered by RowId.
    /// Returns computed active minutes per segment.
    /// </summary>
    public async Task<List<PrmSegmentDto>> GetSegmentsAsync(
        string tenantSlug, int prmId, string airport, CancellationToken ct = default)
    {
        await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);

        // Airport may be a CSV (e.g. "DEL,BOM"); a single PRM record lives at
        // one airport, so we just need any of the requested airports to match.
        var airports = airport.Split(
            ',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var baseQuery = db.PrmServices.AsNoTracking().Where(r => r.Id == prmId);
        var rows = await (airports.Length > 0
                ? baseQuery.Where(r => airports.Contains(r.LocName))
                : baseQuery.Where(r => r.LocName == airport))
            .OrderBy(r => r.RowId)
            .ToListAsync(ct);

        var segments = rows.Select(r => new PrmSegmentDto(
            r.RowId,
            r.StartTime,
            r.PausedAt,
            r.EndTime,
            TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime)))
            .ToList();

        _logger.LogInformation("Segments for {Slug}/{Airport}/PRM#{Id}: {Count} segments",
            tenantSlug, airport, prmId, segments.Count);

        return segments;
    }
}
