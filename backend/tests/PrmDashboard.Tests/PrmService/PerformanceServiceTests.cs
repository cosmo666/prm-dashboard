using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class PerformanceServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private PerformanceService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new PerformanceService(_fx.Duck, _fx.Paths, NullLogger<PerformanceService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetDurationStatsAsync_ReturnsPositivePercentiles()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationStatsAsync(PrmFixtureBuilder.Tenant, f);
        Assert.True(r.Min >= 0);
        Assert.True(r.Avg >= r.Min);
        Assert.True(r.P95 >= r.Median);
    }

    [Fact]
    public async Task GetDurationStatsAsync_EmptyFilter_ReturnsAllZeros()
    {
        var f = new PrmFilterParams { Airport = "ZZZ" };
        var r = await _svc.GetDurationStatsAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(new DurationStatsResponse(0, 0, 0, 0, 0, 0), r);
    }

    [Fact]
    public async Task GetDurationDistributionAsync_BucketsCoverAllRows()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationDistributionAsync(PrmFixtureBuilder.Tenant, f);
        var sumCounts = r.Buckets.Sum(b => b.Count);
        Assert.True(sumCounts > 0);
        Assert.InRange(r.Buckets.Sum(b => b.Percentage), 99.0, 101.0);
    }

    [Fact]
    public async Task GetPauseAnalysisAsync_CountsPausedServices()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetPauseAnalysisAsync(PrmFixtureBuilder.Tenant, f);
        // Fixture id 1 is the only paused service at DEL: paused at 920, resumed at 930.
        // Expected gap: (930/100*60 + 930%100) - (920/100*60 + 920%100) = 570 - 560 = 10 min.
        Assert.Equal(1, r.TotalPaused);
        Assert.Equal(10.0, r.AvgPauseDurationMinutes);
    }

    [Fact]
    public async Task GetNoShowsAsync_IdentifiesNoShowFlagN()
    {
        var f = new PrmFilterParams { Airport = "BOM" };
        var r = await _svc.GetNoShowsAsync(PrmFixtureBuilder.Tenant, f);
        // Fixture Id=3 at BOM has NoShowFlag='N'
        Assert.Contains(r.Items, i => i.Airline == "6E" && i.NoShows == 1);
    }

    [Fact]
    public async Task GetDurationByAgentTypeAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDurationByAgentTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.ServiceTypes.Count, r.Self.Count);
        Assert.Equal(r.ServiceTypes.Count, r.Outsourced.Count);
    }
}
