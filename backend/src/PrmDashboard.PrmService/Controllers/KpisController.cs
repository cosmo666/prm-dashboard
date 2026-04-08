using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/kpis")]
public class KpisController : ControllerBase
{
    private readonly KpiService _kpiService;
    private readonly ILogger<KpisController> _logger;

    public KpisController(KpiService kpiService, ILogger<KpisController> logger)
    {
        _kpiService = kpiService;
        _logger = logger;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _kpiService.GetSummaryAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("handling-distribution")]
    public async Task<IActionResult> GetHandlingDistribution([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _kpiService.GetHandlingDistributionAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("requested-vs-provided")]
    public async Task<IActionResult> GetRequestedVsProvided([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _kpiService.GetRequestedVsProvidedAsync(slug, filters);
        return Ok(result);
    }

    private string? GetTenantSlug()
    {
        return Request.Headers["X-Tenant-Slug"].FirstOrDefault();
    }
}
