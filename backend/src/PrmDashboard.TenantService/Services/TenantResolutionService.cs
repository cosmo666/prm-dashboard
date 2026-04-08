using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;
using PrmDashboard.TenantService.Data;

namespace PrmDashboard.TenantService.Services;

public class TenantResolutionService
{
    private readonly MasterDbContext _db;
    private readonly IMemoryCache _cache;
    private readonly SchemaMigrator _migrator;
    private readonly ILogger<TenantResolutionService> _logger;

    private static readonly TimeSpan ConfigCacheDuration = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan ResolveCacheDuration = TimeSpan.FromMinutes(5);

    public TenantResolutionService(
        MasterDbContext db,
        IMemoryCache cache,
        SchemaMigrator migrator,
        ILogger<TenantResolutionService> logger)
    {
        _db = db;
        _cache = cache;
        _migrator = migrator;
        _logger = logger;
    }

    /// <summary>
    /// Returns tenant config for the login page (public, no credentials).
    /// Cached for 10 minutes.
    /// </summary>
    public async Task<TenantConfigResponse?> GetConfigAsync(string slug, CancellationToken ct = default)
    {
        var cacheKey = $"tenant:config:{slug}";

        if (_cache.TryGetValue(cacheKey, out TenantConfigResponse? cached))
            return cached;

        var tenant = await _db.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive, ct);

        if (tenant == null)
        {
            _logger.LogWarning("Tenant config not found for slug {Slug}", slug);
            return null;
        }

        var config = new TenantConfigResponse(
            tenant.Id,
            tenant.Name,
            tenant.Slug,
            tenant.LogoUrl,
            tenant.PrimaryColor
        );

        _cache.Set(cacheKey, config, ConfigCacheDuration);
        return config;
    }

    /// <summary>
    /// Resolves a tenant by slug, runs schema migrations on cache miss,
    /// and returns the tenant entity with a decrypted connection string.
    /// Cached for 5 minutes.
    /// </summary>
    public async Task<Tenant?> ResolveAsync(string slug, CancellationToken ct = default)
    {
        var cacheKey = $"tenant:resolve:{slug}";

        if (_cache.TryGetValue(cacheKey, out Tenant? cached))
            return cached;

        var tenant = await _db.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Slug == slug && t.IsActive, ct);

        if (tenant == null)
        {
            _logger.LogWarning("Tenant not found for slug {Slug}", slug);
            return null;
        }

        var connStr = tenant.GetConnectionString();

        // Run schema migrations BEFORE caching — ensures cache reflects only migrated tenants
        await _migrator.RunAsync(connStr, ct);

        _logger.LogInformation("Tenant {Slug} resolved and migrated, caching for {Minutes}m",
            slug, ResolveCacheDuration.TotalMinutes);

        _cache.Set(cacheKey, tenant, ResolveCacheDuration);
        return tenant;
    }

    /// <summary>
    /// Returns airports assigned to an employee (for RBAC).
    /// </summary>
    public async Task<List<AirportDto>> GetAirportsForEmployeeAsync(int employeeId, CancellationToken ct = default)
    {
        var airports = await _db.EmployeeAirports
            .AsNoTracking()
            .Where(ea => ea.EmployeeId == employeeId)
            .Select(ea => new AirportDto(ea.AirportCode, ea.AirportName))
            .ToListAsync(ct);

        return airports;
    }
}
