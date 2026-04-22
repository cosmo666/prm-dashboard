using Microsoft.Extensions.Hosting;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Startup gate + injectable cache: loads active tenants from
/// <c>master/tenants.parquet</c> once at <see cref="StartAsync"/>, then exposes
/// them as an immutable dictionary for the hot <c>/config</c> lookup path.
/// Process restart (which a Parquet rebuild requires anyway) is the only way
/// to refresh the dict — replaces the legacy 5-minute <c>IMemoryCache</c>.
///
/// Registered twice in DI: once as a singleton (so <see cref="TenantResolutionService"/>
/// can inject it), once as a hosted service (so the runtime calls
/// <see cref="StartAsync"/> during app startup).
/// </summary>
public sealed class TenantsLoader : IHostedService
{
    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly ILogger<TenantsLoader> _logger;

    private IReadOnlyDictionary<string, TenantInfo>? _configsBySlug;

    public TenantsLoader(IDuckDbContext duck, TenantParquetPaths paths, ILogger<TenantsLoader> logger)
    {
        _duck = duck;
        _paths = paths;
        _logger = logger;
    }

    /// <summary>
    /// Snapshot of active tenants keyed by slug. Throws if accessed before
    /// <see cref="StartAsync"/> has populated the dict.
    /// </summary>
    public IReadOnlyDictionary<string, TenantInfo> ConfigBySlug =>
        _configsBySlug ?? throw new InvalidOperationException(
            "TenantsLoader not initialized. StartAsync must run first.");

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _configsBySlug = await LoadAsync(cancellationToken);
        _logger.LogInformation("Loaded {Count} active tenants at startup", _configsBySlug.Count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task<IReadOnlyDictionary<string, TenantInfo>> LoadAsync(CancellationToken ct)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, name, slug, is_active, created_at, logo_url, primary_color
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE is_active
            """;

        var result = new Dictionary<string, TenantInfo>(StringComparer.Ordinal);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var info = new TenantInfo(
                Id: reader.GetInt32(0),
                Name: reader.GetString(1),
                Slug: reader.GetString(2),
                IsActive: reader.GetBoolean(3),
                CreatedAt: reader.GetDateTime(4),
                LogoUrl: reader.IsDBNull(5) ? null : reader.GetString(5),
                PrimaryColor: reader.GetString(6));
            result[info.Slug] = info;
        }
        return result;
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
