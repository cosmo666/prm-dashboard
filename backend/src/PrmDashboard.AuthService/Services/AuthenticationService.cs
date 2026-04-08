using Microsoft.EntityFrameworkCore;
using PrmDashboard.AuthService.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class AuthenticationService
{
    private const string BcryptPendingPrefix = "BCRYPT_PENDING:";

    private readonly MasterDbContext _db;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthenticationService> _logger;

    public AuthenticationService(
        MasterDbContext db,
        JwtService jwt,
        IConfiguration config,
        ILogger<AuthenticationService> logger)
    {
        _db = db;
        _jwt = jwt;
        _config = config;
        _logger = logger;
    }

    public async Task<LoginResponse?> LoginAsync(string tenantSlug, LoginRequest request, CancellationToken ct = default)
    {
        var tenant = await _db.Tenants
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Slug == tenantSlug && t.IsActive, ct);
        if (tenant == null)
        {
            _logger.LogWarning("Login failed: unknown or inactive tenant {TenantSlug}", tenantSlug);
            return null;
        }

        var employee = await _db.Employees
            .Include(e => e.Airports)
            .FirstOrDefaultAsync(
                e => e.TenantId == tenant.Id && e.Username == request.Username && e.IsActive,
                ct);

        if (employee == null)
        {
            _logger.LogWarning("Login failed: unknown user {Username} for tenant {TenantId}",
                request.Username, tenant.Id);
            return null;
        }

        if (!VerifyAndMaybeBootstrapPassword(employee, request.Password))
        {
            _logger.LogWarning("Login failed: bad password for employee {EmployeeId}", employee.Id);
            return null;
        }

        employee.LastLogin = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var accessToken = _jwt.GenerateAccessToken(employee, tenantSlug);

        var employeeDto = new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            employee.Airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList()
        );

        return new LoginResponse(accessToken, employeeDto);
    }

    /// <summary>
    /// Verifies the supplied password against the stored hash. If the stored value uses
    /// the BCRYPT_PENDING:&lt;plaintext&gt; bootstrap convention from the seed file, this
    /// upgrades it to a real bcrypt hash on first successful match.
    /// </summary>
    private bool VerifyAndMaybeBootstrapPassword(Employee employee, string supplied)
    {
        if (employee.PasswordHash.StartsWith(BcryptPendingPrefix, StringComparison.Ordinal))
        {
            var expected = employee.PasswordHash[BcryptPendingPrefix.Length..];
            if (!string.Equals(supplied, expected, StringComparison.Ordinal))
                return false;

            // Bootstrap: rewrite to a real bcrypt hash so future logins use normal verify
            employee.PasswordHash = BCrypt.Net.BCrypt.HashPassword(supplied);
            _logger.LogInformation("Bootstrapped bcrypt hash for employee {EmployeeId}", employee.Id);
            return true;
        }

        return BCrypt.Net.BCrypt.Verify(supplied, employee.PasswordHash);
    }

    public async Task<RefreshToken> CreateRefreshTokenAsync(int employeeId, CancellationToken ct = default)
    {
        var refreshDays = int.TryParse(_config["Jwt:RefreshTokenDays"], out var d) && d > 0 ? d : 7;
        var refreshToken = new RefreshToken
        {
            EmployeeId = employeeId,
            Token = _jwt.GenerateRefreshToken(),
            ExpiresAt = DateTime.UtcNow.AddDays(refreshDays)
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync(ct);
        return refreshToken;
    }

    public async Task<(string? accessToken, RefreshToken? newRefreshToken)> RefreshAsync(string token, CancellationToken ct = default)
    {
        // Atomic compare-and-swap: revoke the token only if it's currently valid.
        // This prevents a race where two parallel requests both see the token as
        // valid and both issue new ones.
        var now = DateTime.UtcNow;
        var rowsAffected = await _db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE refresh_tokens SET revoked = 1 WHERE token = {token} AND revoked = 0 AND expires_at > {now}",
            ct);

        if (rowsAffected == 0)
        {
            _logger.LogWarning("Refresh failed: token not found, already revoked, or expired");
            return (null, null);
        }

        // Now that we own the revocation, load the employee for JWT generation
        var revoked = await _db.RefreshTokens
            .Include(rt => rt.Employee)
                .ThenInclude(e => e.Airports)
            .Include(rt => rt.Employee)
                .ThenInclude(e => e.Tenant)
            .AsNoTracking()
            .FirstOrDefaultAsync(rt => rt.Token == token, ct);

        if (revoked == null) return (null, null); // shouldn't happen but be safe

        var accessToken = _jwt.GenerateAccessToken(revoked.Employee, revoked.Employee.Tenant.Slug);
        var newRefresh = await CreateRefreshTokenAsync(revoked.EmployeeId, ct);

        return (accessToken, newRefresh);
    }

    public async Task RevokeRefreshTokenAsync(string token, CancellationToken ct = default)
    {
        var existing = await _db.RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == token, ct);
        if (existing != null)
        {
            existing.Revoked = true;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task<EmployeeDto?> GetProfileAsync(int employeeId, CancellationToken ct = default)
    {
        var employee = await _db.Employees
            .Include(e => e.Airports)
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == employeeId && e.IsActive, ct);

        if (employee == null) return null;

        return new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            employee.Airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList()
        );
    }
}
