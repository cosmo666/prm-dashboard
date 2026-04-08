using Microsoft.AspNetCore.Http;

namespace PrmDashboard.Shared.Middleware;

/// <summary>
/// Runs after authentication. If the authenticated user has a tenant_slug claim and the
/// request carries an X-Tenant-Slug header, they must match. Prevents cross-tenant access
/// via header manipulation.
/// </summary>
public class TenantSlugClaimCheckMiddleware
{
    private readonly RequestDelegate _next;

    public TenantSlugClaimCheckMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var claimSlug = context.User.FindFirst("tenant_slug")?.Value;
            var headerSlug = context.Request.Headers["X-Tenant-Slug"].FirstOrDefault();

            if (!string.IsNullOrEmpty(claimSlug)
                && !string.IsNullOrEmpty(headerSlug)
                && !string.Equals(claimSlug, headerSlug, StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = 403;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new
                {
                    type = "https://httpstatuses.com/403",
                    title = "Forbidden",
                    status = 403,
                    detail = "Tenant slug mismatch between JWT claim and X-Tenant-Slug header"
                });
                return;
            }
        }

        await _next(context);
    }
}
