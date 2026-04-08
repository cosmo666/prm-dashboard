using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace PrmDashboard.PrmService.Data;

/// <summary>
/// Resolves tenant DB connections by calling TenantService's resolve endpoint.
/// Caches connection strings for 5 minutes to avoid repeated HTTP calls.
/// </summary>
public class TenantDbContextFactory
{
    private readonly HttpClient _httpClient;
    private readonly IMemoryCache _cache;
    private readonly ILogger<TenantDbContextFactory> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public TenantDbContextFactory(
        HttpClient httpClient,
        IMemoryCache cache,
        ILogger<TenantDbContextFactory> logger)
    {
        _httpClient = httpClient;
        _cache = cache;
        _logger = logger;
    }

    public async Task<TenantDbContext> CreateDbContextAsync(string tenantSlug)
    {
        var cacheKey = $"tenant-conn:{tenantSlug}";

        if (!_cache.TryGetValue(cacheKey, out TenantResolveResult? cached))
        {
            _logger.LogInformation("Resolving tenant {Slug} via TenantService", tenantSlug);

            var response = await _httpClient.GetAsync($"/api/tenants/resolve/{tenantSlug}");
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            cached = JsonSerializer.Deserialize<TenantResolveResult>(json, JsonOptions)
                ?? throw new InvalidOperationException($"Failed to deserialize tenant resolution for '{tenantSlug}'");

            _cache.Set(cacheKey, cached, TimeSpan.FromMinutes(5));
            _logger.LogInformation("Cached tenant {Slug} (TenantId={TenantId}) for 5 minutes", tenantSlug, cached.TenantId);
        }

        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseMySql(cached!.DbConnectionString, new MySqlServerVersion(new Version(8, 0, 36)))
            .Options;

        return new TenantDbContext(options);
    }

    private record TenantResolveResult(int TenantId, string DbConnectionString);
}
