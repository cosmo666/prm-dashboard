using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/breakdowns")]
public class BreakdownsController : ControllerBase
{
    private readonly BreakdownService _breakdownService;

    public BreakdownsController(BreakdownService breakdownService)
    {
        _breakdownService = breakdownService;
    }

    [HttpGet("by-service-type")]
    public async Task<IActionResult> GetByServiceType([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _breakdownService.GetByServiceTypeAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("by-agent-type")]
    public async Task<IActionResult> GetByAgentType([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _breakdownService.GetByAgentTypeAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("by-airline")]
    public async Task<IActionResult> GetByAirline([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _breakdownService.GetByAirlineAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("by-location")]
    public async Task<IActionResult> GetByLocation([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _breakdownService.GetByLocationAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("by-route")]
    public async Task<IActionResult> GetByRoute(
        [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _breakdownService.GetByRouteAsync(slug, filters, limit);
        return Ok(result);
    }

    private string? GetTenantSlug()
    {
        return Request.Headers["X-Tenant-Slug"].FirstOrDefault();
    }
}
