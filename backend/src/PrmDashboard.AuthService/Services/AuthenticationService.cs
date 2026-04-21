using System.Data;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class AuthenticationService
{
    private const string BcryptPendingPrefix = "BCRYPT_PENDING:";

    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly InMemoryRefreshTokenStore _tokens;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthenticationService> _logger;

    public AuthenticationService(
        IDuckDbContext duck,
        TenantParquetPaths paths,
        InMemoryRefreshTokenStore tokens,
        JwtService jwt,
        IConfiguration config,
        ILogger<AuthenticationService> logger)
    {
        _duck = duck;
        _paths = paths;
        _tokens = tokens;
        _jwt = jwt;
        _config = config;
        _logger = logger;
    }

    public async Task<LoginResponse?> LoginAsync(string tenantSlug, LoginRequest request, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);

        var tenant = await LookupTenantAsync(session.Connection, tenantSlug, ct);
        if (tenant is null)
        {
            _logger.LogWarning("Login failed: unknown or inactive tenant {TenantSlug}", tenantSlug);
            return null;
        }

        var (employee, airports, passwordHash) = await LookupEmployeeByUsernameAsync(
            session.Connection, tenant.Id, request.Username, ct);
        if (employee is null)
        {
            _logger.LogWarning("Login failed: unknown user {Username} for tenant {TenantId}",
                request.Username, tenant.Id);
            return null;
        }

        if (!VerifyPassword(passwordHash!, request.Password, employee.Id))
        {
            _logger.LogWarning("Login failed: bad password for employee {EmployeeId}", employee.Id);
            return null;
        }

        // Audit log replaces the legacy last_login UPDATE — Parquet is read-only at runtime
        _logger.LogInformation("AuthEvent login employee={EmployeeId} tenant={TenantSlug} at {Timestamp}",
            employee.Id, tenantSlug, DateTime.UtcNow);

        // employee.Airports is already populated by MaterializeEmployeeRowsAsync.
        // JwtService.GenerateAccessToken needs employee.TenantId for the tenant_id claim,
        // so pass the materialized Employee directly — do not substitute a stub.
        var accessToken = _jwt.GenerateAccessToken(employee, tenantSlug);

        var employeeDto = new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList());

        return new LoginResponse(accessToken, employeeDto);
    }

    /// <summary>
    /// Verifies the supplied password against the stored hash. Supports the
    /// <c>BCRYPT_PENDING:&lt;plaintext&gt;</c> seed-bootstrap format for back-compat with
    /// Phase 1 Parquet dumps — the self-upgrade-on-first-login path is intentionally
    /// dropped because Parquet is read-only at runtime.
    /// </summary>
    private bool VerifyPassword(string storedHash, string supplied, int employeeId)
    {
        if (storedHash.StartsWith(BcryptPendingPrefix, StringComparison.Ordinal))
        {
            var expected = storedHash[BcryptPendingPrefix.Length..];
            var matches = string.Equals(supplied, expected, StringComparison.Ordinal);
            if (matches)
            {
                _logger.LogWarning(
                    "BCRYPT_PENDING plaintext hash accepted for employee {EmployeeId} — regenerate master Parquet with real bcrypt hashes to eliminate.",
                    employeeId);
            }
            return matches;
        }

        return BCrypt.Net.BCrypt.Verify(supplied, storedHash);
    }

    public Task<RefreshTokenIssued> CreateRefreshTokenAsync(int employeeId, string tenantSlug, CancellationToken ct = default)
    {
        var refreshDays = int.TryParse(_config["Jwt:RefreshTokenDays"], out var d) && d > 0 ? d : 7;
        var token = _jwt.GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddDays(refreshDays);

        _tokens.Add(token, new RefreshTokenEntry(employeeId, tenantSlug, expiresAt));
        return Task.FromResult(new RefreshTokenIssued(token, expiresAt));
    }

    public async Task<(string? accessToken, RefreshTokenIssued? newRefreshToken)> RefreshAsync(
        string token, CancellationToken ct = default)
    {
        if (!_tokens.TryConsume(token, out var consumed))
        {
            _logger.LogWarning("Refresh failed: token not found, already consumed, or expired");
            return (null, null);
        }

        await using var session = await _duck.AcquireAsync(ct);
        var (employee, airports, _) = await LookupEmployeeByIdAsync(session.Connection, consumed.EmployeeId, ct);
        if (employee is null)
        {
            _logger.LogWarning("Refresh failed: employee {EmployeeId} no longer exists or is inactive", consumed.EmployeeId);
            return (null, null);
        }

        // Materialized employee.Airports + TenantId already populated; pass directly
        var accessToken = _jwt.GenerateAccessToken(employee, consumed.TenantSlug);
        var issued = await CreateRefreshTokenAsync(consumed.EmployeeId, consumed.TenantSlug, ct);

        return (accessToken, issued);
    }

    public Task RevokeRefreshTokenAsync(string token, CancellationToken ct = default)
    {
        _tokens.Revoke(token);
        return Task.CompletedTask;
    }

    public async Task<EmployeeDto?> GetProfileAsync(int employeeId, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        var (employee, airports, _) = await LookupEmployeeByIdAsync(session.Connection, employeeId, ct);
        if (employee is null) return null;

        return new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList());
    }

    // -------------------- private DuckDB helpers --------------------

    private async Task<TenantInfo?> LookupTenantAsync(DuckDBConnection conn, string slug, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, name, slug, is_active, created_at, logo_url, primary_color
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE slug = $slug AND is_active
            LIMIT 1
            """;
        cmd.Parameters.Add(new DuckDBParameter("slug", slug));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new TenantInfo(
            Id: reader.GetInt32(0),
            Name: reader.GetString(1),
            Slug: reader.GetString(2),
            IsActive: reader.GetBoolean(3),
            CreatedAt: reader.GetDateTime(4),
            LogoUrl: reader.IsDBNull(5) ? null : reader.GetString(5),
            PrimaryColor: reader.GetString(6));
    }

    /// <summary>
    /// Returns (employee, airports, passwordHash). Null employee if not found or inactive.
    /// Password hash is kept separate from the returned <see cref="Employee"/> so tests +
    /// JWT generation never see it.
    /// </summary>
    private async Task<(Employee?, List<EmployeeAirport>, string?)> LookupEmployeeByUsernameAsync(
        DuckDBConnection conn, int tenantId, string username, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT e.id, e.tenant_id, e.username, e.password_hash, e.display_name, e.email,
                   e.is_active, e.created_at, e.last_login,
                   ea.airport_code, ea.airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployees)}' e
            LEFT JOIN '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}' ea
              ON ea.employee_id = e.id
            WHERE e.tenant_id = $tid AND e.username = $uname AND e.is_active
            ORDER BY e.id, ea.airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("tid", tenantId));
        cmd.Parameters.Add(new DuckDBParameter("uname", username));

        return await MaterializeEmployeeRowsAsync(cmd, ct);
    }

    private async Task<(Employee?, List<EmployeeAirport>, string?)> LookupEmployeeByIdAsync(
        DuckDBConnection conn, int employeeId, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT e.id, e.tenant_id, e.username, e.password_hash, e.display_name, e.email,
                   e.is_active, e.created_at, e.last_login,
                   ea.airport_code, ea.airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployees)}' e
            LEFT JOIN '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}' ea
              ON ea.employee_id = e.id
            WHERE e.id = $eid AND e.is_active
            ORDER BY ea.airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("eid", employeeId));

        return await MaterializeEmployeeRowsAsync(cmd, ct);
    }

    private static async Task<(Employee?, List<EmployeeAirport>, string?)> MaterializeEmployeeRowsAsync(
        DuckDBCommand cmd, CancellationToken ct)
    {
        await using var reader = await cmd.ExecuteReaderAsync(ct);

        Employee? emp = null;
        string? passwordHash = null;
        var airports = new List<EmployeeAirport>();

        while (await reader.ReadAsync(ct))
        {
            if (emp is null)
            {
                emp = new Employee
                {
                    Id = reader.GetInt32(0),
                    TenantId = reader.GetInt32(1),
                    Username = reader.GetString(2),
                    DisplayName = reader.GetString(4),
                    Email = reader.IsDBNull(5) ? null : reader.GetString(5),
                    IsActive = reader.GetBoolean(6),
                    CreatedAt = reader.GetDateTime(7),
                    LastLogin = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                };
                passwordHash = reader.GetString(3);
            }

            if (!reader.IsDBNull(9))
            {
                airports.Add(new EmployeeAirport
                {
                    EmployeeId = emp.Id,
                    AirportCode = reader.GetString(9),
                    AirportName = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                });
            }
        }

        if (emp is not null)
        {
            emp.Airports = airports;
        }
        return (emp, airports, passwordHash);
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
