using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DataPathValidatorTests
{
    private static DataPathValidator Build(string root)
    {
        return new DataPathValidator(Options.Create(new DataPathOptions { Root = root }));
    }

    [Fact]
    public async Task StartAsync_RootMissing_Throws()
    {
        var missing = Path.Combine(Path.GetTempPath(), $"nonexistent-{System.Guid.NewGuid():N}");
        var validator = Build(missing);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            validator.StartAsync(CancellationToken.None));
        Assert.Contains(missing, ex.Message);
    }

    [Fact]
    public async Task StartAsync_MasterMissing_Throws()
    {
        var root = Path.Combine(Path.GetTempPath(), $"root-only-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var validator = Build(root);
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                validator.StartAsync(CancellationToken.None));
            Assert.Contains("master", ex.Message);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task StartAsync_RootAndMasterPresent_Succeeds()
    {
        var root = Path.Combine(Path.GetTempPath(), $"valid-{System.Guid.NewGuid():N}");
        var master = Path.Combine(root, "master");
        Directory.CreateDirectory(master);
        try
        {
            var validator = Build(root);
            // Must not throw
            await validator.StartAsync(CancellationToken.None);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task StopAsync_IsNoOp_DoesNotThrow()
    {
        var root = Path.Combine(Path.GetTempPath(), $"stop-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(root, "master"));
        try
        {
            var validator = Build(root);
            await validator.StartAsync(CancellationToken.None);
            await validator.StopAsync(CancellationToken.None); // must not throw
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
