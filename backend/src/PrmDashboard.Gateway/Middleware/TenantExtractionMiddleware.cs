namespace PrmDashboard.Gateway.Middleware;

/// <summary>
/// Extracts tenant slug from the Host header subdomain and sets X-Tenant-Slug
/// on the request for downstream services.
/// In Development, falls back to the existing X-Tenant-Slug header or ?tenant_slug= query param.
/// In Production, no fallback — if no subdomain is present, downstream services will
/// reject the request via TenantSlugClaimCheckMiddleware / AirportAccessMiddleware.
/// </summary>
public class TenantExtractionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantExtractionMiddleware> _logger;
    private readonly IWebHostEnvironment _env;

    public TenantExtractionMiddleware(
        RequestDelegate next,
        ILogger<TenantExtractionMiddleware> logger,
        IWebHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
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

        // Development-only fallback: existing header or query param
        if (string.IsNullOrEmpty(slug) && _env.IsDevelopment())
        {
            if (context.Request.Headers.TryGetValue("X-Tenant-Slug", out var headerSlug)
                && !string.IsNullOrEmpty(headerSlug))
            {
                slug = headerSlug!;
                _logger.LogDebug("Dev fallback: using tenant slug {Slug} from X-Tenant-Slug header", slug);
            }
            else if (context.Request.Query.TryGetValue("tenant_slug", out var querySlug)
                     && !string.IsNullOrEmpty(querySlug))
            {
                slug = querySlug!;
                _logger.LogDebug("Dev fallback: using tenant slug {Slug} from query parameter", slug);
            }
        }

        if (!string.IsNullOrEmpty(slug))
        {
            context.Request.Headers["X-Tenant-Slug"] = slug;
            _logger.LogInformation("Tenant {Slug} resolved for {Method} {Path}", slug, context.Request.Method, context.Request.Path);
        }
        else
        {
            _logger.LogDebug("No tenant slug resolved for {Method} {Path}", context.Request.Method, context.Request.Path);
        }

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
