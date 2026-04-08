using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class JwtService
{
    private readonly IConfiguration _config;

    public JwtService(IConfiguration config)
    {
        _config = config;
    }

    public string GenerateAccessToken(Employee employee, string tenantSlug)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
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
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(GetAccessTokenMinutes()),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private int GetAccessTokenMinutes() =>
        int.TryParse(_config["Jwt:AccessTokenMinutes"], out var m) && m > 0 ? m : 15;

    public string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }
}
