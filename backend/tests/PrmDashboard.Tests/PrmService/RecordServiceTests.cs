using Microsoft.Extensions.Logging.Abstractions;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.PrmService;

public class RecordServiceTests : IAsyncLifetime
{
    private readonly PrmFixtureBuilder _fx = new();
    private RecordService _svc = null!;

    public async Task InitializeAsync()
    {
        await _fx.InitializeAsync();
        _svc = new RecordService(_fx.Duck, _fx.Paths, NullLogger<RecordService>.Instance);
    }

    public Task DisposeAsync() => _fx.DisposeAsync();

    [Fact]
    public async Task GetRecordsAsync_Dedup_ReturnsFirstRowPerId()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 1, pageSize: 100);

        // No duplicate ids
        var ids = r.Items.Select(i => i.Id).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());

        // Id 1 → first row (row_id=1, start_time=900), not the row_id=2 row
        var one = r.Items.Single(i => i.Id == 1);
        Assert.Equal(1, one.RowId);
        Assert.Equal(900, one.StartTime);
    }

    [Fact]
    public async Task GetRecordsAsync_Pagination_SplitsResults()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var p1 = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 1, pageSize: 3);
        var p2 = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f, page: 2, pageSize: 3);

        Assert.Equal(3, p1.Items.Count);
        Assert.True(p2.Items.Count > 0);
        Assert.Empty(p1.Items.Select(i => i.Id).Intersect(p2.Items.Select(i => i.Id)));
        Assert.Equal(p1.TotalCount, p2.TotalCount);
    }

    [Fact]
    public async Task GetSegmentsAsync_PausedService_ReturnsBothSegments()
    {
        var segs = await _svc.GetSegmentsAsync(PrmFixtureBuilder.Tenant, prmId: 1, airport: "DEL");
        Assert.Equal(2, segs.Count);
        Assert.Equal(1, segs[0].RowId);
        Assert.Equal(2, segs[1].RowId);
        Assert.Equal(20, segs[0].ActiveMinutes); // 9:00 → 9:20 (paused)
        Assert.Equal(45, segs[1].ActiveMinutes); // 9:30 → 10:15
    }

    [Fact]
    public async Task GetSegmentsAsync_UnknownId_ReturnsEmpty()
    {
        var segs = await _svc.GetSegmentsAsync(PrmFixtureBuilder.Tenant, prmId: 9999, airport: "DEL");
        Assert.Empty(segs);
    }

    [Fact]
    public async Task GetRecordsAsync_SortStartTimeAsc_ReturnsItemsInAscendingOrder()
    {
        var f = new PrmFilterParams { Airport = "DEL" };
        var r = await _svc.GetRecordsAsync(PrmFixtureBuilder.Tenant, f,
            page: 1, pageSize: 100, sort: "start_time:asc");
        var times = r.Items.Select(i => i.StartTime).ToList();
        Assert.Equal(times.OrderBy(x => x).ToList(), times);
    }
}
