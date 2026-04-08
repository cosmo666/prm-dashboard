namespace PrmDashboard.Gateway.Middleware;

/// <summary>
/// Extracts tenant slug from the Host header subdomain and sets X-Tenant-Slug
/// on the request for downstream services.
/// Falls back to existing header, query param, or default for localhost dev.
/// </summary>
public class TenantExtractionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantExtractionMiddleware> _logger;

    public TenantExtractionMiddleware(RequestDelegate next, ILogger<TenantExtractionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var host = context.Request.Host.Host;
        string? slug = null;

        // Try subdomain extraction: aeroground.prm-app.com → aeroground
        var parts = host.Split('.');
        if (parts.Length >= 3 && !string.Equals(parts[0], "www", StringComparison.OrdinalIgnoreCase))
        {
            slug = parts[0];
            _logger.LogDebug("Extracted tenant slug {Slug} from subdomain of {Host}", slug, host);
        }

        // Localhost fallback chain: existing header → query param → default
        if (string.IsNullOrEmpty(slug))
        {
            if (context.Request.Headers.TryGetValue("X-Tenant-Slug", out var headerSlug)
                && !string.IsNullOrEmpty(headerSlug))
            {
                slug = headerSlug!;
                _logger.LogDebug("Using tenant slug {Slug} from X-Tenant-Slug header", slug);
            }
            else if (context.Request.Query.TryGetValue("tenant_slug", out var querySlug)
                     && !string.IsNullOrEmpty(querySlug))
            {
                slug = querySlug!;
                _logger.LogDebug("Using tenant slug {Slug} from query parameter", slug);
            }
            else
            {
                slug = "aeroground";
                _logger.LogDebug("No tenant slug found, defaulting to {Slug}", slug);
            }
        }

        context.Request.Headers["X-Tenant-Slug"] = slug;
        _logger.LogInformation("Tenant {Slug} resolved for {Method} {Path}", slug, context.Request.Method, context.Request.Path);

        await _next(context);
    }
}

public static class TenantExtractionMiddlewareExtensions
{
    public static IApplicationBuilder UseTenantExtraction(this IApplicationBuilder app)
    {
        return app.UseMiddleware<TenantExtractionMiddleware>();
    }
}
