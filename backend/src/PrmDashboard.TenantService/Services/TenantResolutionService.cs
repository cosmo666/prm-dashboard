using System.Data;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Minimal DTO-like record returned by <see cref="TenantResolutionService.ResolveAsync"/>
/// so the <see cref="Controllers.TenantController.Resolve"/> handler can build
/// its legacy <c>TenantResolveResponse</c> without referencing the EF
/// <c>Tenant</c> entity. Field names match the legacy entity so the controller
/// code does not need to change.
/// </summary>
public sealed record LegacyTenantResolveData(
    int Id,
    string Slug,
    string DbHost,
    int DbPort,
    string DbName,
    string DbUser,
    string DbPassword);

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
    /// Returns the legacy DB-connection fields for PrmService's internal
    /// tenant resolution path. Preserved verbatim during Phase 3c so
    /// PrmService (still on EF+MySQL) keeps working. Phase 3d retires both
    /// this endpoint and its caller.
    /// </summary>
    public async Task<LegacyTenantResolveData?> ResolveAsync(string slug, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, slug, db_host, db_port, db_name, db_user, db_password
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE slug = $slug AND is_active
            LIMIT 1
            """;
        cmd.Parameters.Add(new DuckDBParameter("slug", slug));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            _logger.LogWarning("Tenant not found for slug {Slug}", slug);
            return null;
        }

        return new LegacyTenantResolveData(
            Id: reader.GetInt32(0),
            Slug: reader.GetString(1),
            DbHost: reader.GetString(2),
            DbPort: reader.GetInt32(3),
            DbName: reader.GetString(4),
            DbUser: reader.GetString(5),
            DbPassword: reader.GetString(6));
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
