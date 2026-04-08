using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.Models;
using Xunit;

namespace PrmDashboard.Tests.AuthService;

/// <summary>
/// Verifies JwtService round-trips all required claims and honors the
/// comma-joined `airports` contract the PRM middleware depends on.
/// </summary>
public class JwtServiceTests
{
    private static JwtService BuildService()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                // 32+ char secret required for HS256 SymmetricSecurityKey
                ["Jwt:Secret"] = "this-is-a-long-enough-test-secret-0123456789",
                ["Jwt:Issuer"] = "prm-dashboard-test",
                ["Jwt:Audience"] = "prm-dashboard-clients",
                ["Jwt:AccessTokenMinutes"] = "15"
            })
            .Build();

        return new JwtService(config);
    }

    private static Employee BuildEmployee() => new()
    {
        Id = 42,
        TenantId = 7,
        Username = "alice",
        DisplayName = "Alice Tester",
        Airports = new List<EmployeeAirport>
        {
            new() { AirportCode = "BLR", AirportName = "Bengaluru" },
            new() { AirportCode = "HYD", AirportName = "Hyderabad" },
            new() { AirportCode = "DEL", AirportName = "Delhi" }
        }
    };

    [Fact]
    public void GenerateAccessToken_RoundTrip_ContainsAllExpectedClaims()
    {
        var svc = BuildService();
        var employee = BuildEmployee();

        var tokenString = svc.GenerateAccessToken(employee, tenantSlug: "aeroground");

        Assert.False(string.IsNullOrWhiteSpace(tokenString));

        var handler = new JwtSecurityTokenHandler();
        var token = handler.ReadJwtToken(tokenString);

        Assert.Equal("prm-dashboard-test", token.Issuer);
        Assert.Contains("prm-dashboard-clients", token.Audiences);

        // Standard sub claim carries the employee id
        var sub = token.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value;
        Assert.Equal("42", sub);

        Assert.Equal("7", token.Claims.First(c => c.Type == "tenant_id").Value);
        Assert.Equal("aeroground", token.Claims.First(c => c.Type == "tenant_slug").Value);
        Assert.Equal("Alice Tester", token.Claims.First(c => c.Type == "name").Value);

        // Airports are serialized as a single comma-joined claim, not multiple entries
        var airportsClaim = token.Claims.First(c => c.Type == "airports").Value;
        Assert.Equal("BLR,HYD,DEL", airportsClaim);

        // Expiry is in the future (allow small clock skew)
        Assert.True(token.ValidTo > DateTime.UtcNow.AddMinutes(1));
        Assert.True(token.ValidTo <= DateTime.UtcNow.AddMinutes(16));
    }
}
