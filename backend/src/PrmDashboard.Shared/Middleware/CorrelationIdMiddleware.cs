using Microsoft.AspNetCore.Http;
using Serilog.Context;

namespace PrmDashboard.Shared.Middleware;

/// <summary>
/// Reads X-Correlation-Id from the incoming request (or generates a new GUID if absent),
/// echoes it on the response, and pushes it into Serilog's LogContext so every log line
/// within the request scope is stamped with CorrelationId. Run this BEFORE
/// UseSerilogRequestLogging so access logs include the correlation id.
/// </summary>
public class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var id = context.Request.Headers[HeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(id))
        {
            id = Guid.NewGuid().ToString("N");
        }

        context.Items["CorrelationId"] = id;
        context.Request.Headers[HeaderName] = id;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[HeaderName] = id;
            return Task.CompletedTask;
        });

        using (LogContext.PushProperty("CorrelationId", id))
        {
            await _next(context);
        }
    }
}
