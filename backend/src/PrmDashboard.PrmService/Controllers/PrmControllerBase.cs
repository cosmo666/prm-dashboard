using Microsoft.AspNetCore.Mvc;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
public abstract class PrmControllerBase : ControllerBase
{
    /// <summary>
    /// Reads the gateway-injected <c>X-Tenant-Slug</c> header. Throws if missing or empty —
    /// the upstream <c>TenantSlugClaimCheckMiddleware</c> already enforces presence for
    /// authenticated requests, so reaching this method without a slug indicates a
    /// misconfiguration (e.g. the middleware was removed). Failing fast surfaces it as 500
    /// rather than producing a path like <c>data//prm_services.parquet</c>.
    /// </summary>
    protected string GetTenantSlug()
    {
        var slug = Request.Headers["X-Tenant-Slug"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(slug))
            throw new InvalidOperationException(
                "X-Tenant-Slug header missing — TenantSlugClaimCheckMiddleware should have rejected this request");
        return slug;
    }
}
