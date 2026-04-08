using Microsoft.AspNetCore.Builder;
using Serilog;
using Serilog.Events;

namespace PrmDashboard.Shared.Logging;

public static class SerilogBootstrap
{
    /// <summary>
    /// Registers Serilog as the global logger with a console sink + structured
    /// output that includes CorrelationId when present in the LogContext.
    /// Call before builder.Build().
    /// </summary>
    public static void AddPrmSerilog(this WebApplicationBuilder builder, string serviceName)
    {
        builder.Host.UseSerilog((ctx, services, lc) => lc
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .Enrich.WithMachineName()
            .Enrich.WithProperty("Service", serviceName)
            .WriteTo.Console(
                outputTemplate:
                    "{Timestamp:HH:mm:ss} [{Level:u3}] {Service} {CorrelationId} {Message:lj}{NewLine}{Exception}")
            .ReadFrom.Configuration(ctx.Configuration));
    }
}
