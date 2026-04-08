using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/rankings")]
public class RankingsController : PrmControllerBase
{
    private readonly RankingService _rankingService;

    public RankingsController(RankingService rankingService)
    {
        _rankingService = rankingService;
    }

    [HttpGet("airlines")]
    public async Task<IActionResult> GetTopAirlines(
        [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10, CancellationToken ct = default)
    {
        var slug = GetTenantSlug();
        var result = await _rankingService.GetTopAirlinesAsync(slug, filters, limit, ct);
        return Ok(result);
    }

    [HttpGet("flights")]
    public async Task<IActionResult> GetTopFlights(
        [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10, CancellationToken ct = default)
    {
        var slug = GetTenantSlug();
        var result = await _rankingService.GetTopFlightsAsync(slug, filters, limit, ct);
        return Ok(result);
    }

    [HttpGet("agents")]
    public async Task<IActionResult> GetTopAgents(
        [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10, CancellationToken ct = default)
    {
        var slug = GetTenantSlug();
        var result = await _rankingService.GetTopAgentsAsync(slug, filters, limit, ct);
        return Ok(result);
    }

    [HttpGet("services")]
    public async Task<IActionResult> GetTopServices([FromQuery] PrmFilterParams filters, CancellationToken ct)
    {
        var slug = GetTenantSlug();
        var result = await _rankingService.GetTopServicesAsync(slug, filters, ct);
        return Ok(result);
    }
}
