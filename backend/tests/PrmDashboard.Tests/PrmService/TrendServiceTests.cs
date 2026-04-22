using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class TrendServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private TrendService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new TrendService(_fx.Duck, _fx.Paths, NullLogger<TrendService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetDailyAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetDailyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.Dates.Count, r.Values.Count);
        Assert.True(r.Average >= 0);
    }

    [Fact]
    public async Task GetMonthlyAsync_UsesYYYYMMLabels()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetMonthlyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.All(r.Months, m => Assert.Matches(@"^\d{4}-\d{2}$", m));
    }

    [Fact]
    public async Task GetHourlyAsync_ReturnsSevenByTwentyFourGrid()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetHourlyAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(new[] { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" }, r.Days.ToArray());
        Assert.Equal(24, r.Hours.Count);
        Assert.Equal(7, r.Values.Count);
        Assert.All(r.Values, row => Assert.Equal(24, row.Count));
    }

    [Fact]
    public async Task GetRequestedVsProvidedAsync_ReturnsParallelArrays()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRequestedVsProvidedAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Equal(r.Dates.Count, r.Provided.Count);
        Assert.Equal(r.Dates.Count, r.Requested.Count);
    }
}
