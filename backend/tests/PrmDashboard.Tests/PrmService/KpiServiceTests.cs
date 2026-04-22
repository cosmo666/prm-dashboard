using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class KpiServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private KpiService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new KpiService(_fx.Duck, _fx.Paths, NullLogger<KpiService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetSummaryAsync_NoDateRange_SkipsPrevPeriod()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetSummaryAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalPrm > 0);
        Assert.Equal(0, r.TotalPrmPrevPeriod);
    }

    [Fact]
    public async Task GetSummaryAsync_WithDateRange_IncludesPrevPeriod()
    {
        // 7-day window: prevStart = Feb 22, prevEnd = Feb 28
        // Fixture ids 15-17 have dates Feb 24, Feb 23, Feb 22 → captured in prev period
        var f = new PrmFilterParams
        {
            Airport = "DEL",
            DateFrom = new DateOnly(2026, 3, 1),
            DateTo = new DateOnly(2026, 3, 7)
        };
        var r = await _svc.GetSummaryAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalPrm > 0);
        // Ids 15-17 (dates Feb 22-24) fall into prev period window Feb 22-28
        Assert.True(r.TotalPrmPrevPeriod > 0);
    }

    [Fact]
    public async Task GetHandlingDistributionAsync_SplitsBySelfVsOutsourced()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetHandlingDistributionAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Contains("SELF", r.Labels);
        // Seeds at DEL include both SELF and OUTSOURCED (ids 4-10 alternate)
        Assert.NotEmpty(r.Values);
    }

    [Fact]
    public async Task GetRequestedVsProvidedAsync_BoundsFulfillmentRate()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRequestedVsProvidedAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.TotalProvided > 0);
        Assert.InRange(r.FulfillmentRate, 0, 100);
        // Id 2 at DEL has Requested=0; all others at DEL have Requested=1.
        // So TotalRequested < TotalProvided, meaning WalkUpRate > 0.
        Assert.True(r.WalkUpRate > 0);
    }
}
