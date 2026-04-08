using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class JwtService
{
    private readonly string _secret;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _accessTokenMinutes;

    public JwtService(IConfiguration configuration)
    {
        _secret = configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret is required");
        _issuer = configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("Jwt:Issuer is required");
        _audience = configuration["Jwt:Audience"] ?? throw new InvalidOperationException("Jwt:Audience is required");
        _accessTokenMinutes = int.TryParse(configuration["Jwt:AccessTokenMinutes"], out var m) && m > 0 ? m : 15;
    }

    public string GenerateAccessToken(Employee employee, string tenantSlug)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var airportCodes = employee.Airports.Select(a => a.AirportCode).ToList();

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, employee.Id.ToString()),
            new("tenant_id", employee.TenantId.ToString()),
            new("tenant_slug", tenantSlug),
            new("name", employee.DisplayName),
            // `airports` is stored as a comma-joined string (e.g., "BLR,HYD,DEL"), not as
            // multiple Claim entries with the same name. The PRM Service airport-RBAC
            // middleware (Task 6) MUST split this on ',' when validating ?airport= against
            // the JWT claim. Single-value contract is intentional for simpler claim
            // extraction in downstream middleware.
            new("airports", string.Join(",", airportCodes)),
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_accessTokenMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }
}
