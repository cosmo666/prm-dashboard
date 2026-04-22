using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.TenantService.Services;

public class TenantResolutionService
{
    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly TenantsLoader _tenants;
    private readonly ILogger<TenantResolutionService> _logger;

    public TenantResolutionService(
        IDuckDbContext duck,
        TenantParquetPaths paths,
        TenantsLoader tenants,
        ILogger<TenantResolutionService> logger)
    {
        _duck = duck;
        _paths = paths;
        _tenants = tenants;
        _logger = logger;
    }

    /// <summary>
    /// Returns tenant config for the login page (public, no credentials).
    /// Served from the startup-loaded dictionary — no per-request Parquet read.
    /// </summary>
    public Task<TenantConfigResponse?> GetConfigAsync(string slug, CancellationToken ct = default)
    {
        if (!_tenants.ConfigBySlug.TryGetValue(slug, out var info))
        {
            _logger.LogWarning("Tenant config not found for slug {Slug}", slug);
            return Task.FromResult<TenantConfigResponse?>(null);
        }

        return Task.FromResult<TenantConfigResponse?>(new TenantConfigResponse(
            info.Id,
            info.Name,
            info.Slug,
            info.LogoUrl,
            info.PrimaryColor));
    }

    /// <summary>
    /// Returns airports assigned to an employee (for RBAC).
    /// </summary>
    public async Task<List<AirportDto>> GetAirportsForEmployeeAsync(int employeeId, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT airport_code, airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}'
            WHERE employee_id = $eid
            ORDER BY airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("eid", employeeId));

        var result = new List<AirportDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new AirportDto(
                Code: reader.GetString(0),
                Name: reader.IsDBNull(1) ? string.Empty : reader.GetString(1)));
        }
        return result;
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
