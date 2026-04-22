using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class BreakdownServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private BreakdownService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new BreakdownService(_fx.Duck, _fx.Paths, NullLogger<BreakdownService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetByAirlineAsync_Percentages_SumToApprox100()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByAirlineAsync(PrmFixtureBuilder.Tenant, f);
        Assert.InRange(r.Items.Sum(x => x.Percentage), 99.0, 101.0);
        // Seed has AI at DEL across ids 1,2,4,6,8 (non-mod-4) + 15-20 → most distinct AI rows
        // and UK at ids 4,8 (i%4==0) → fewer. Total > 0.
        Assert.True(r.Items.Sum(x => x.Count) > 0);
    }

    [Fact]
    public async Task GetByRouteAsync_OnlyRowsWithDepAndArr()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByRouteAsync(PrmFixtureBuilder.Tenant, f, limit: 10);
        Assert.All(r.Items, i =>
        {
            Assert.False(string.IsNullOrEmpty(i.Departure));
            Assert.False(string.IsNullOrEmpty(i.Arrival));
        });
        // Seed: DEL ids have Departure=DEL, Arrival=BOM (most rows) — at least 1 route
        Assert.NotEmpty(r.Items);
    }

    [Fact]
    public async Task GetByServiceTypeAsync_ReturnsMatrixRows()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByServiceTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.NotEmpty(r.ServiceTypes);
        Assert.NotEmpty(r.Rows);
        // Seed has WCHR and MAAS service types at DEL
        Assert.Contains("WCHR", r.ServiceTypes);
    }

    [Fact]
    public async Task GetByAgentTypeAsync_ProducesSankey()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByAgentTypeAsync(PrmFixtureBuilder.Tenant, f);
        Assert.NotEmpty(r.Nodes);
        Assert.NotEmpty(r.Links);
        // SELF is present for ids 1,2,4,6,8,10 + 15-20 at DEL
        Assert.Contains(r.Nodes, n => n.Name == "SELF");
    }

    [Fact]
    public async Task GetByLocationAsync_SkipsNullOrEmpty()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetByLocationAsync(PrmFixtureBuilder.Tenant, f);
        Assert.All(r.Items, i => Assert.False(string.IsNullOrEmpty(i.Label)));
        // Seed has ids 1,2 with pos_location set at DEL (Gate-1, Gate-2)
        Assert.NotEmpty(r.Items);
    }

    [Fact]
    public async Task GetAgentServiceMatrixAsync_LimitEnforced()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetAgentServiceMatrixAsync(PrmFixtureBuilder.Tenant, f, limit: 3);
        Assert.True(r.Agents.Count <= 3);
        // Values grid should have same outer length as agents
        Assert.Equal(r.Agents.Count, r.Values.Count);
    }
}
