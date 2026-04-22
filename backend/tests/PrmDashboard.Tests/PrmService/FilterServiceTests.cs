using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class FilterServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private FilterService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new FilterService(_fx.Duck, _fx.Paths, NullLogger<FilterService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetOptionsAsync_UnknownTenant_ThrowsTenantParquetNotFound()
    {
        // Tenant slug with no parquet file on disk should produce a typed
        // exception that ExceptionHandlerMiddleware translates to 404 (not 500).
        var ex = await Assert.ThrowsAsync<TenantParquetNotFoundException>(
            () => _svc.GetOptionsAsync("never-onboarded", "DEL"));
        Assert.Equal("never-onboarded", ex.TenantSlug);
    }

    [Fact]
    public async Task GetOptionsAsync_SingleAirport_ReturnsAllDimensions()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "DEL");

        Assert.Contains("AI", r.Airlines);
        Assert.Contains("WCHR", r.Services);
        Assert.Contains("SELF", r.HandledBy);
        Assert.NotEmpty(r.Flights);
        Assert.NotNull(r.MinDate);
        Assert.NotNull(r.MaxDate);
        // Fixture has rows predating start (Id 15-20) at DEL
        Assert.True(r.MinDate < r.MaxDate);
    }

    [Fact]
    public async Task GetOptionsAsync_MultiAirport_UnionsDistinctValues()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "DEL,BOM");
        Assert.Contains("AI", r.Airlines);
        Assert.Contains("6E", r.Airlines);
    }

    [Fact]
    public async Task GetOptionsAsync_UnknownAirport_ReturnsEmpty()
    {
        var r = await _svc.GetOptionsAsync(PrmFixtureBuilder.Tenant, "ZZZ");
        Assert.Empty(r.Airlines);
        Assert.Null(r.MinDate);
        Assert.Null(r.MaxDate);
    }
}
