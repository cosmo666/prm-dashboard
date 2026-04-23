using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace PrmDashboard.Shared.Middleware;

/// <summary>
/// Runs after authentication. For an authenticated user with a <c>tenant_slug</c> claim,
/// the request MUST carry an <c>X-Tenant-Slug</c> header AND it must match the claim.
/// Rejects with 400 (missing header) or 403 (mismatch). The gateway is responsible for
/// setting the header from the subdomain; a request without the header has bypassed the
/// gateway and should not be served.
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
            if (!string.IsNullOrEmpty(claimSlug))
            {
                var headerSlug = context.Request.Headers["X-Tenant-Slug"].FirstOrDefault();

                if (string.IsNullOrEmpty(headerSlug))
                {
                    await WriteProblem(context, 400, "Bad Request",
                        "X-Tenant-Slug header is required for authenticated requests");
                    return;
                }

                if (!string.Equals(claimSlug, headerSlug, StringComparison.OrdinalIgnoreCase))
                {
                    await WriteProblem(context, 403, "Forbidden",
                        "Tenant slug mismatch between JWT claim and X-Tenant-Slug header");
                    return;
                }
            }
        }

        await _next(context);
    }

    private static async Task WriteProblem(HttpContext context, int status, string title, string detail)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";
        // Use WriteAsync with pre-serialized JSON so WriteAsJsonAsync cannot override ContentType.
        var body = JsonSerializer.Serialize(new { type = $"https://httpstatuses.com/{status}", title, status, detail });
        await context.Response.WriteAsync(body);
    }
}
