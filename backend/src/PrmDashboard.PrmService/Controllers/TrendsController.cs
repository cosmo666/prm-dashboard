using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/trends")]
public class TrendsController : PrmControllerBase
{
    private readonly TrendService _trendService;

    public TrendsController(TrendService trendService)
    {
        _trendService = trendService;
    }

    [HttpGet("daily")]
    public async Task<IActionResult> GetDaily([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        var result = await _trendService.GetDailyAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("monthly")]
    public async Task<IActionResult> GetMonthly([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        var result = await _trendService.GetMonthlyAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("hourly")]
    public async Task<IActionResult> GetHourly([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        var result = await _trendService.GetHourlyAsync(slug, filters);
        return Ok(result);
    }

    [HttpGet("requested-vs-provided")]
    public async Task<IActionResult> GetRequestedVsProvided([FromQuery] PrmFilterParams filters)
    {
        var slug = GetTenantSlug();
        var result = await _trendService.GetRequestedVsProvidedAsync(slug, filters);
        return Ok(result);
    }
}
