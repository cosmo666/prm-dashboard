using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm/filters")]
public class FiltersController : ControllerBase
{
    private readonly FilterService _filterService;
    private readonly ILogger<FiltersController> _logger;

    public FiltersController(FilterService filterService, ILogger<FiltersController> logger)
    {
        _filterService = filterService;
        _logger = logger;
    }

    [HttpGet("options")]
    public async Task<IActionResult> GetOptions([FromQuery] string airport)
    {
        if (string.IsNullOrEmpty(airport))
            return BadRequest("The 'airport' query parameter is required.");

        var slug = Request.Headers["X-Tenant-Slug"].FirstOrDefault();
        if (slug is null) return BadRequest("Missing X-Tenant-Slug header");

        var result = await _filterService.GetOptionsAsync(slug, airport);
        return Ok(result);
    }
}
