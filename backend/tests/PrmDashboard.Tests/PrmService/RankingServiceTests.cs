using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class RankingServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private RankingService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new RankingService(_fx.Duck, _fx.Paths, NullLogger<RankingService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetTopAirlinesAsync_SortedDescendingWithPercentage()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopAirlinesAsync(PrmFixtureBuilder.Tenant, f, limit: 10);

        Assert.NotEmpty(r.Items);
        // Descending count
        for (var i = 1; i < r.Items.Count; i++)
            Assert.True(r.Items[i - 1].Count >= r.Items[i].Count);
        Assert.True(r.Items.All(x => x.Percentage >= 0 && x.Percentage <= 100));
    }

    [Fact]
    public async Task GetTopServicesAsync_NoLimit_ReturnsAllServiceTypes()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopServicesAsync(PrmFixtureBuilder.Tenant, f);
        Assert.Contains(r.Items, i => i.Label == "WCHR");
    }

    [Fact]
    public async Task GetTopFlightsAsync_SeparatesRequestedAndServiced()
    {
        var f = new PrmFilterParams { Airport = "BOM" };
        var r = await _svc.GetTopFlightsAsync(PrmFixtureBuilder.Tenant, f, limit: 10);
        // Id 3 at BOM is a no-show, so requested=1, serviced=0 for 6E201
        var item = r.Items.Single(i => i.Label == "6E201");
        Assert.Equal(1, item.RequestedCount);
        Assert.Equal(0, item.ServicedCount);
    }

    [Fact]
    public async Task GetTopAgentsAsync_ReturnsPerAgentMetrics()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetTopAgentsAsync(PrmFixtureBuilder.Tenant, f, limit: 5);
        Assert.NotEmpty(r.Items);
        Assert.All(r.Items, a => Assert.True(a.PrmCount > 0));
        Assert.Equal(1, r.Items[0].Rank);
    }
}
