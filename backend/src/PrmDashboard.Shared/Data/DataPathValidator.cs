using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Startup gate: verifies the configured data path and its <c>master/</c> subdirectory
/// exist before the service accepts traffic. Register with
/// <c>services.AddHostedService&lt;DataPathValidator&gt;()</c>. Throws
/// <see cref="InvalidOperationException"/> on failure, which aborts service startup.
/// </summary>
public sealed class DataPathValidator : IHostedService
{
    private readonly DataPathOptions _options;

    public DataPathValidator(IOptions<DataPathOptions> options)
    {
        _options = options.Value;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.Root) || !Directory.Exists(_options.Root))
            throw new InvalidOperationException($"Data path does not exist: {_options.Root}");

        var masterDir = Path.Combine(_options.Root, "master");
        if (!Directory.Exists(masterDir))
            throw new InvalidOperationException($"Master data directory missing: {masterDir}");

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
