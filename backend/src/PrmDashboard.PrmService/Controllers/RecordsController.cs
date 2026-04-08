using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PrmDashboard.PrmService.Services;
using PrmDashboard.Shared.DTOs;

namespace PrmDashboard.PrmService.Controllers;

[ApiController]
[Authorize]
[Route("api/prm")]
public class RecordsController : PrmControllerBase
{
    private readonly RecordService _recordService;

    public RecordsController(RecordService recordService)
    {
        _recordService = recordService;
    }

    [HttpGet("records")]
    public async Task<IActionResult> GetRecords(
        [FromQuery] PrmFilterParams filters,
        [FromQuery] int page = 1,
        [FromQuery] int size = 20,
        [FromQuery] string sort = "service_date:desc")
    {
        var slug = GetTenantSlug();
        var result = await _recordService.GetRecordsAsync(slug, filters, page, size, sort);
        return Ok(result);
    }

    [HttpGet("records/{id:int}/segments")]
    public async Task<IActionResult> GetSegments(int id, [FromQuery] string airport)
    {
        if (string.IsNullOrEmpty(airport))
            return BadRequest("The 'airport' query parameter is required.");

        var slug = GetTenantSlug();
        var result = await _recordService.GetSegmentsAsync(slug, id, airport);
        return Ok(result);
    }
}
