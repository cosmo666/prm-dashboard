using System.Text.Json;
using PrmDashboard.PrmService.Services;

namespace PrmDashboard.PrmService.Middleware;

public class ExceptionHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlerMiddleware> _logger;

    public ExceptionHandlerMiddleware(RequestDelegate next, ILogger<ExceptionHandlerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (TenantParquetNotFoundException ex)
        {
            // Newly provisioned tenant whose data hasn't been generated yet.
            // Log as Information (not Error) — this is a known operational state, not a bug.
            _logger.LogInformation("Tenant data missing: {TenantSlug}", ex.TenantSlug);
            await WriteProblem(context, 404, "Not Found",
                $"No PRM data available for tenant '{ex.TenantSlug}'");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");
            await WriteProblem(context, 500, "Internal Server Error", "An unexpected error occurred");
        }
    }

    private static async Task WriteProblem(HttpContext context, int status, string title, string detail)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";
        // Use WriteAsync with pre-serialized JSON so WriteAsJsonAsync cannot override ContentType.
        var body = JsonSerializer.Serialize(new { type = $"https://httpstatuses.com/{status}", title, status, detail });
        await context.Response.WriteAsync(body);
    }
}
