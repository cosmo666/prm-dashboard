using Microsoft.EntityFrameworkCore;
using PrmDashboard.PrmService.Data;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

/// <summary>
/// Tests <see cref="BaseQueryService.ApplyFilters"/> using an in-memory EF Core
/// provider. Seeds a small fixture of PRM service rows across two airports and
/// multiple airlines, then verifies each filter narrows the result set as expected.
/// </summary>
public class BaseQueryServiceFilterTests
{
    /// <summary>
    /// Minimal test subclass that exposes the protected ApplyFilters method.
    /// The factory dependency is null because these tests drive the DbContext
    /// directly — we never call CreateDbContextAsync on the base factory.
    /// </summary>
    private sealed class TestQueryService : BaseQueryService
    {
        public TestQueryService() : base(null!) { }

        public IQueryable<PrmServiceRecord> ApplyFiltersPublic(TenantDbContext db, PrmFilterParams filters)
            => ApplyFilters(db, filters);
    }

    private static TenantDbContext BuildSeededContext()
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var db = new TenantDbContext(options);

        db.PrmServices.AddRange(
            // BLR rows
            new PrmServiceRecord
            {
                RowId = 1, Id = 1001, Flight = "IX101", FlightNumber = 101,
                PassengerName = "Alice", PrmAgentType = "SELF",
                StartTime = 800, EndTime = 830, Service = "WCHR",
                LocName = "BLR", Airline = "IX",
                ServiceDate = new DateOnly(2026, 1, 5)
            },
            new PrmServiceRecord
            {
                RowId = 2, Id = 1002, Flight = "AI201", FlightNumber = 201,
                PassengerName = "Bob", PrmAgentType = "SELF",
                StartTime = 900, EndTime = 945, Service = "WCHC",
                LocName = "BLR", Airline = "AI",
                ServiceDate = new DateOnly(2026, 2, 10)
            },
            new PrmServiceRecord
            {
                RowId = 3, Id = 1003, Flight = "QF501", FlightNumber = 501,
                PassengerName = "Carol", PrmAgentType = "SUBCON",
                StartTime = 1000, EndTime = 1020, Service = "WCHR",
                LocName = "BLR", Airline = "QF",
                ServiceDate = new DateOnly(2026, 3, 15)
            },
            // DEL rows
            new PrmServiceRecord
            {
                RowId = 4, Id = 2001, Flight = "IX301", FlightNumber = 301,
                PassengerName = "Dave", PrmAgentType = "SELF",
                StartTime = 1100, EndTime = 1130, Service = "WCHR",
                LocName = "DEL", Airline = "IX",
                ServiceDate = new DateOnly(2026, 1, 20)
            },
            new PrmServiceRecord
            {
                RowId = 5, Id = 2002, Flight = "AI401", FlightNumber = 401,
                PassengerName = "Eve", PrmAgentType = "SELF",
                StartTime = 1200, EndTime = 1230, Service = "MAAS",
                LocName = "DEL", Airline = "AI",
                ServiceDate = new DateOnly(2026, 2, 25)
            }
        );

        db.SaveChanges();
        return db;
    }

    [Fact]
    public void ApplyFilters_AirportBlr_ReturnsOnlyBlrRows()
    {
        using var db = BuildSeededContext();
        var svc = new TestQueryService();

        var results = svc.ApplyFiltersPublic(db, new PrmFilterParams { Airport = "BLR" }).ToList();

        Assert.Equal(3, results.Count);
        Assert.All(results, r => Assert.Equal("BLR", r.LocName));
    }

    [Fact]
    public void ApplyFilters_AirportDel_ReturnsOnlyDelRows()
    {
        using var db = BuildSeededContext();
        var svc = new TestQueryService();

        var results = svc.ApplyFiltersPublic(db, new PrmFilterParams { Airport = "DEL" }).ToList();

        Assert.Equal(2, results.Count);
        Assert.All(results, r => Assert.Equal("DEL", r.LocName));
    }

    [Fact]
    public void ApplyFilters_AirportAndAirline_NarrowsToSingleRow()
    {
        using var db = BuildSeededContext();
        var svc = new TestQueryService();

        var results = svc.ApplyFiltersPublic(
            db,
            new PrmFilterParams { Airport = "BLR", Airline = "IX" }
        ).ToList();

        Assert.Single(results);
        Assert.Equal("IX101", results[0].Flight);
    }

    [Fact]
    public void ApplyFilters_DateRange_ExcludesRowsOutsideWindow()
    {
        using var db = BuildSeededContext();
        var svc = new TestQueryService();

        // Window covers Feb 1 -> Feb 28 inclusive: only BLR row 2 (Feb 10) qualifies
        var results = svc.ApplyFiltersPublic(db, new PrmFilterParams
        {
            Airport = "BLR",
            DateFrom = new DateOnly(2026, 2, 1),
            DateTo = new DateOnly(2026, 2, 28)
        }).ToList();

        Assert.Single(results);
        Assert.Equal(1002, results[0].Id);
    }
}
