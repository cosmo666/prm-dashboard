using System.IO;
using System.Threading;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using PrmDashboard.TenantService.Services;
using Xunit;

namespace PrmDashboard.Tests.TenantService;

public class TenantResolutionServiceTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private TenantResolutionService _sut = null!;

    // Fixture values
    private const int TenantId = 7;
    private const string ActiveSlug = "active";
    private const string InactiveSlug = "gone";
    private const string UnknownSlug = "ghost";
    private const int EmployeeWithAirports = 42;
    private const int UnknownEmployeeId = 999;

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"tenantres-test-{System.Guid.NewGuid():N}");
        var masterDir = Path.Combine(_tempRoot, "master");
        Directory.CreateDirectory(masterDir);
        var tenantsPath = Path.Combine(masterDir, "tenants.parquet");
        var airportsPath = Path.Combine(masterDir, "employee_airports.parquet");

        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();

        // Two rows — one active, one inactive — so inactive-slug and unknown-slug scenarios
        // can both be exercised.
        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {TenantId}::INTEGER AS id,
                           'Active Co'::VARCHAR AS name,
                           '{ActiveSlug}'::VARCHAR AS slug,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::VARCHAR AS logo_url,
                           '#111111'::VARCHAR AS primary_color
                    UNION ALL
                    SELECT 99, 'Gone Co', '{InactiveSlug}',
                           FALSE, TIMESTAMP '2026-01-01 00:00:00', NULL, '#222222'
                ) TO '{tenantsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT 1::INTEGER AS id, {EmployeeWithAirports}::INTEGER AS employee_id,
                           'DEL'::VARCHAR AS airport_code, 'Delhi'::VARCHAR AS airport_name
                    UNION ALL
                    SELECT 2, {EmployeeWithAirports}, 'BOM', 'Mumbai'
                    UNION ALL
                    SELECT 3, 100, 'BLR', 'Bangalore'  -- belongs to some other employee
                ) TO '{airportsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);

        // TenantsLoader needs its StartAsync to populate the dict — call it manually.
        var loader = new TenantsLoader(duck, paths, NullLogger<TenantsLoader>.Instance);
        await loader.StartAsync(CancellationToken.None);

        _sut = new TenantResolutionService(
            duck,
            paths,
            loader,
            NullLogger<TenantResolutionService>.Instance);
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    // ---- GetConfigAsync ----

    [Fact]
    public async Task GetConfigAsync_KnownSlug_ReturnsConfig()
    {
        var result = await _sut.GetConfigAsync(ActiveSlug, CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(TenantId, result!.Id);
        Assert.Equal("Active Co", result.Name);
        Assert.Equal(ActiveSlug, result.Slug);
        Assert.Null(result.LogoUrl);
        Assert.Equal("#111111", result.PrimaryColor);
    }

    [Fact]
    public async Task GetConfigAsync_UnknownSlug_ReturnsNull()
    {
        var result = await _sut.GetConfigAsync(UnknownSlug, CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task GetConfigAsync_InactiveSlug_ReturnsNull()
    {
        // Inactive row is filtered at startup load
        var result = await _sut.GetConfigAsync(InactiveSlug, CancellationToken.None);
        Assert.Null(result);
    }

    // ---- GetAirportsForEmployeeAsync ----

    [Fact]
    public async Task GetAirportsForEmployeeAsync_WithAirports_ReturnsList()
    {
        var airports = await _sut.GetAirportsForEmployeeAsync(EmployeeWithAirports, CancellationToken.None);

        Assert.Equal(2, airports.Count);
        Assert.Contains(airports, a => a.Code == "BOM" && a.Name == "Mumbai");
        Assert.Contains(airports, a => a.Code == "DEL" && a.Name == "Delhi");
    }

    [Fact]
    public async Task GetAirportsForEmployeeAsync_UnknownEmployee_ReturnsEmpty()
    {
        var airports = await _sut.GetAirportsForEmployeeAsync(UnknownEmployeeId, CancellationToken.None);
        Assert.Empty(airports);
    }
}
