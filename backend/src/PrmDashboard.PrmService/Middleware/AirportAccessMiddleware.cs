using System.Security.Claims;
using System.Text.Json;

namespace PrmDashboard.PrmService.Middleware;

/// <summary>
/// Validates that the requested airport (from query param) is in the user's
/// JWT airports claim. Only applies to /api/prm paths.
/// Returns 400 if airport param is missing, 403 if not in allowed list.
/// </summary>
public class AirportAccessMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AirportAccessMiddleware> _logger;

    public AirportAccessMiddleware(RequestDelegate next, ILogger<AirportAccessMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        // Only enforce on PRM API paths
        if (!path.StartsWith("/api/prm", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        // Unauthenticated: defer to [Authorize] which returns 401
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        var airportParam = context.Request.Query["airport"].FirstOrDefault();
        if (string.IsNullOrEmpty(airportParam))
        {
            _logger.LogWarning("Missing airport query parameter on {Path}", path);
            context.Response.StatusCode = 400;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                title = "Bad Request",
                status = 400,
                detail = "The 'airport' query parameter is required."
            }));
            return;
        }

        var airportsClaim = context.User.FindFirstValue("airports");
        if (string.IsNullOrEmpty(airportsClaim))
        {
            _logger.LogWarning("No airports claim in JWT for user {Sub}", context.User.FindFirstValue(ClaimTypes.NameIdentifier));
            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                type = "https://tools.ietf.org/html/rfc9110#section-15.5.4",
                title = "Forbidden",
                status = 403,
                detail = "No airport access configured for this user."
            }));
            return;
        }

        var allowedAirports = airportsClaim.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (!allowedAirports.Contains(airportParam.Trim(), StringComparer.OrdinalIgnoreCase))
        {
            _logger.LogWarning("User {Sub} attempted access to airport {Airport} but allowed airports are [{Allowed}]",
                context.User.FindFirstValue(ClaimTypes.NameIdentifier), airportParam, airportsClaim);
            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/problem+json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                type = "https://tools.ietf.org/html/rfc9110#section-15.5.4",
                title = "Forbidden",
                status = 403,
                detail = $"Access denied for airport '{airportParam}'."
            }));
            return;
        }

        await _next(context);
    }
}
