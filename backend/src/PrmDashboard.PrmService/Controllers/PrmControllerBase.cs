using Microsoft.AspNetCore.Mvc;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
public abstract class PrmControllerBase : ControllerBase
{
    protected string GetTenantSlug() =>
        Request.Headers["X-Tenant-Slug"].FirstOrDefault() ?? "";
}
