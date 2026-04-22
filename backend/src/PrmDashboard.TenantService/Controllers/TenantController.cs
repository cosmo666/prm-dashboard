using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.TenantService.Services;

namespace PrmDashboard.TenantService.Controllers;

[ApiController]
[Route("api/tenants")]
public class TenantController : ControllerBase
{
    private readonly TenantResolutionService _tenantService;

    public TenantController(TenantResolutionService tenantService)
    {
        _tenantService = tenantService;
    }

    /// <summary>
    /// Public endpoint for login page branding. No auth required.
    /// </summary>
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig([FromQuery] string slug, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug))
            return Problem(detail: "slug query parameter is required", statusCode: 400, title: "Bad Request");

        var config = await _tenantService.GetConfigAsync(slug, ct);
        if (config == null)
            return Problem(detail: $"Tenant '{slug}' not found", statusCode: 404, title: "Not Found");

        return Ok(config);
    }

    /// <summary>
    /// Returns airports assigned to the authenticated employee (for RBAC).
    /// </summary>
    [Authorize]
    [HttpGet("airports")]
    public async Task<IActionResult> GetAirports(CancellationToken ct)
    {
        var employeeIdClaim = User.FindFirst("sub")?.Value;
        if (employeeIdClaim == null || !int.TryParse(employeeIdClaim, out var employeeId))
            return Problem(detail: "Invalid or missing sub claim", statusCode: 401, title: "Unauthorized");

        var airports = await _tenantService.GetAirportsForEmployeeAsync(employeeId, ct);
        return Ok(airports);
    }
}
