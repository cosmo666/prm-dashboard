using PrmDashboard.PrmService.Data;

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
        catch (TenantNotFoundException ex)
        {
            _logger.LogWarning(ex, "Tenant not found: {Slug}", ex.TenantSlug);
            await WriteProblem(context, 404, "Tenant Not Found", ex.Message);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Upstream service error");
            await WriteProblem(context, 502, "Bad Gateway", "Upstream service unavailable");
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
        await context.Response.WriteAsJsonAsync(new { type = $"https://httpstatuses.com/{status}", title, status, detail });
    }
}
