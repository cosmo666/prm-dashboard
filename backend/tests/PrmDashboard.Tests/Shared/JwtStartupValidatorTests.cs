using Microsoft.Extensions.Configuration;
using PrmDashboard.Shared.Extensions;
using Xunit;

namespace PrmDashboard.Tests.Shared;

public class JwtStartupValidatorTests
{
    private static IConfiguration BuildConfig(string? secret, string? issuer = "iss", string? audience = "aud")
    {
        var dict = new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = secret,
            ["Jwt:Issuer"] = issuer,
            ["Jwt:Audience"] = audience
        };
        return new ConfigurationBuilder().AddInMemoryCollection(dict).Build();
    }

    [Fact]
    public void ReadAndValidate_ValidConfig_ReturnsJwtConfig()
    {
        var secret = new string('x', 32);
        var cfg = BuildConfig(secret);
        var result = JwtStartupValidator.ReadAndValidate(cfg, "test");
        Assert.Equal(secret, result.Secret);
        Assert.Equal("iss", result.Issuer);
        Assert.Equal("aud", result.Audience);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ReadAndValidate_EmptyOrWhitespaceSecret_Throws(string? secret)
    {
        var cfg = BuildConfig(secret);
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtStartupValidator.ReadAndValidate(cfg, "test"));
        Assert.Contains("Jwt:Secret", ex.Message);
    }

    [Fact]
    public void ReadAndValidate_EmptyIssuer_Throws()
    {
        var cfg = BuildConfig(new string('x', 32), issuer: "");
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtStartupValidator.ReadAndValidate(cfg, "test"));
        Assert.Contains("Jwt:Issuer", ex.Message);
    }

    [Fact]
    public void ReadAndValidate_PlaceholderSecret_Throws()
    {
        // This is the exact fallback in docker-compose.yml and .env.example.
        var cfg = BuildConfig("your-256-bit-secret-key-change-in-production");
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtStartupValidator.ReadAndValidate(cfg, "auth"));
        Assert.Contains("change-in-production", ex.Message);
    }

    [Fact]
    public void ReadAndValidate_PlaceholderSecret_CaseInsensitive()
    {
        var cfg = BuildConfig("SOMETHING-CHANGE-IN-PRODUCTION-PADDED-TO-LENGTH");
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtStartupValidator.ReadAndValidate(cfg, "test"));
        Assert.Contains("change-in-production", ex.Message);
    }

    [Fact]
    public void ReadAndValidate_ShortSecret_Throws()
    {
        // 31 bytes — one short of HS256 minimum.
        var cfg = BuildConfig(new string('y', 31));
        var ex = Assert.Throws<InvalidOperationException>(
            () => JwtStartupValidator.ReadAndValidate(cfg, "test"));
        Assert.Contains("32 bytes", ex.Message);
    }

    [Fact]
    public void ReadAndValidate_ExactlyMinimumBytes_Passes()
    {
        var cfg = BuildConfig(new string('z', 32));
        var result = JwtStartupValidator.ReadAndValidate(cfg, "test");
        Assert.Equal(new string('z', 32), result.Secret);
    }
}
