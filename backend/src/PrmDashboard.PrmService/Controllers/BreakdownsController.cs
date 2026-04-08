using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/breakdowns")]
public class BreakdownsController : PrmControllerBase
{
    private readonly BreakdownService _breakdownService;

    public BreakdownsController(BreakdownService breakdownService)
    {
        _breakdownService = breakdownService;
    }

    [HttpGet("by-service-type")]
    public async Task<IActionResult> GetByServiceType([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _breakdownService.GetByServiceTypeAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("by-agent-type")]
    public async Task<IActionResult> GetByAgentType([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _breakdownService.GetByAgentTypeAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("by-airline")]
    public async Task<IActionResult> GetByAirline([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _breakdownService.GetByAirlineAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("by-location")]
    public async Task<IActionResult> GetByLocation([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _breakdownService.GetByLocationAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("by-route")]
    public async Task<IActionResult> GetByRoute(
        [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10, CancellationToken ct = default)
    {
        var slug = GetTenantSlug();
        var result = await _breakdownService.GetByRouteAsync(slug, filters, limit, ct);
        return Ok(result);
    }
}
