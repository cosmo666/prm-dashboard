using Microsoft.Extensions.Configuration;

namespace PrmDashboard.Shared.Extensions;

/// <summary>
/// Startup-time validation for JWT configuration. Every service that issues or
/// validates JWTs must call <see cref="ReadAndValidate"/> before wiring up its
/// authentication pipeline. Fails fast with a clear message when the config is
/// missing, empty, a well-known placeholder, or shorter than 32 bytes (HS256
/// requires a 256-bit key).
/// </summary>
public static class JwtStartupValidator
{
    /// <summary>
    /// The placeholder value shipped in <c>.env.example</c> and
    /// <c>docker-compose.yml</c> default. Rejecting this at startup prevents a
    /// container from silently running with a publicly-documented secret if the
    /// operator forgets to override it.
    /// </summary>
    private const string PlaceholderMarker = "change-in-production";

    /// <summary>Minimum byte length for HS256. See RFC 7518 §3.2.</summary>
    private const int MinSecretBytes = 32;

    public readonly record struct JwtConfig(string Secret, string Issuer, string Audience);

    public static JwtConfig ReadAndValidate(IConfiguration config, string serviceName)
    {
        var secret = RequireNonEmpty(config["Jwt:Secret"], "Jwt:Secret", serviceName);
        var issuer = RequireNonEmpty(config["Jwt:Issuer"], "Jwt:Issuer", serviceName);
        var audience = RequireNonEmpty(config["Jwt:Audience"], "Jwt:Audience", serviceName);

        if (secret.Contains(PlaceholderMarker, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                $"[{serviceName}] Jwt:Secret contains the well-known placeholder " +
                $"'{PlaceholderMarker}'. Set a real secret via the JWT_SECRET env " +
                "var or override Jwt:Secret in configuration.");

        var byteLength = System.Text.Encoding.UTF8.GetByteCount(secret);
        if (byteLength < MinSecretBytes)
            throw new InvalidOperationException(
                $"[{serviceName}] Jwt:Secret must be at least {MinSecretBytes} bytes " +
                $"(256-bit HS256); got {byteLength} bytes. Generate one with " +
                "'openssl rand -base64 32' or similar.");

        return new JwtConfig(secret, issuer, audience);
    }

    private static string RequireNonEmpty(string? value, string key, string serviceName)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException(
                $"[{serviceName}] {key} is required and must not be empty or whitespace.");
        return value;
    }
}
