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

public class TenantsLoaderTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private string _tenantsParquet = "";

    public Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"tenants-loader-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(_tempRoot, "master"));
        _tenantsParquet = Path.Combine(_tempRoot, "master", "tenants.parquet");
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    private async Task WriteTenantsFixtureAsync(string sqlRows)
    {
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"COPY ({sqlRows}) TO '{_tenantsParquet.Replace("'", "''")}' (FORMAT 'parquet')";
        await cmd.ExecuteNonQueryAsync();
    }

    private TenantsLoader BuildLoader()
    {
        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);
        return new TenantsLoader(duck, paths, NullLogger<TenantsLoader>.Instance);
    }

    [Fact]
    public async Task StartAsync_ValidParquet_PopulatesDict()
    {
        await WriteTenantsFixtureAsync("""
            SELECT 1::INTEGER AS id, 'Tenant One'::VARCHAR AS name, 'one'::VARCHAR AS slug,
                   TRUE::BOOLEAN AS is_active, TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                   NULL::VARCHAR AS logo_url, '#111111'::VARCHAR AS primary_color
            UNION ALL
            SELECT 2, 'Tenant Two', 'two', TRUE, TIMESTAMP '2026-01-01 00:00:00',
                   'https://logo/two.png', '#222222'
            UNION ALL
            SELECT 3, 'Inactive', 'gone', FALSE, TIMESTAMP '2026-01-01 00:00:00',
                   NULL, '#333333'
            """);

        var loader = BuildLoader();
        await loader.StartAsync(CancellationToken.None);

        Assert.Equal(2, loader.ConfigBySlug.Count); // inactive is filtered out
        Assert.True(loader.ConfigBySlug.ContainsKey("one"));
        Assert.True(loader.ConfigBySlug.ContainsKey("two"));
        Assert.False(loader.ConfigBySlug.ContainsKey("gone"));

        var one = loader.ConfigBySlug["one"];
        Assert.Equal(1, one.Id);
        Assert.Equal("Tenant One", one.Name);
        Assert.Null(one.LogoUrl);
        Assert.Equal("#111111", one.PrimaryColor);

        var two = loader.ConfigBySlug["two"];
        Assert.Equal("https://logo/two.png", two.LogoUrl);
    }

    [Fact]
    public async Task StartAsync_NoActiveTenants_ReturnsEmptyDict()
    {
        await WriteTenantsFixtureAsync("""
            SELECT 1::INTEGER AS id, 'Inactive'::VARCHAR AS name, 'gone'::VARCHAR AS slug,
                   FALSE::BOOLEAN AS is_active, TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                   NULL::VARCHAR AS logo_url, '#000000'::VARCHAR AS primary_color
            """);

        var loader = BuildLoader();
        await loader.StartAsync(CancellationToken.None);

        Assert.Empty(loader.ConfigBySlug);
    }

    [Fact]
    public void ConfigBySlug_BeforeStartAsync_Throws()
    {
        var loader = BuildLoader();
        var ex = Assert.Throws<InvalidOperationException>(() => _ = loader.ConfigBySlug);
        Assert.Contains("StartAsync", ex.Message);
    }
}
