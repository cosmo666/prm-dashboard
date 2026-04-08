using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/performance")]
public class PerformanceController : PrmControllerBase
{
    private readonly PerformanceService _performanceService;

    public PerformanceController(PerformanceService performanceService)
    {
        _performanceService = performanceService;
    }

    [HttpGet("duration-distribution")]
    public async Task<IActionResult> GetDurationDistribution([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _performanceService.GetDurationDistributionAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("duration-stats")]
    public async Task<IActionResult> GetDurationStats([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _performanceService.GetDurationStatsAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("no-shows")]
    public async Task<IActionResult> GetNoShows([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _performanceService.GetNoShowsAsync(slug, filters, ct);
        return Ok(result);
    }

    [HttpGet("pause-analysis")]
    public async Task<IActionResult> GetPauseAnalysis([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _performanceService.GetPauseAnalysisAsync(slug, filters, ct);
        return Ok(result);
    }
}
