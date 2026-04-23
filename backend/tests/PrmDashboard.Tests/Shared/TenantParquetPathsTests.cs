using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Shared;

public class TenantParquetPathsTests
{
    private static TenantParquetPaths Build()
    {
        var options = Options.Create(new DataPathOptions { Root = "/data", PoolSize = 4 });
        return new TenantParquetPaths(options);
    }

    [Theory]
    [InlineData("aeroground")]
    [InlineData("skyserve")]
    [InlineData("globalprm")]
    [InlineData("a")]
    [InlineData("tenant-with-hyphens")]
    [InlineData("abc123")]
    public void TenantPrmServices_ValidSlug_ReturnsExpectedPath(string slug)
    {
        var paths = Build();
        var result = paths.TenantPrmServices(slug);
        Assert.EndsWith($"{slug}{Path.DirectorySeparatorChar}prm_services.parquet", result);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("../etc")]
    [InlineData("..")]
    [InlineData("../../secret")]
    [InlineData("foo/bar")]
    [InlineData("foo\\bar")]
    [InlineData("UPPERCASE")]       // must be lowercase
    [InlineData("MixedCase")]
    [InlineData("1starts-with-digit")]
    [InlineData("-starts-with-hyphen")]
    [InlineData("has spaces")]
    [InlineData("has.dots")]
    [InlineData("has/slash")]
    public void TenantPrmServices_InvalidSlug_ThrowsArgumentException(string slug)
    {
        var paths = Build();
        Assert.Throws<ArgumentException>(() => paths.TenantPrmServices(slug));
    }

    [Fact]
    public void TenantPrmServices_51CharSlug_Throws()
    {
        var paths = Build();
        var slug = "a" + new string('b', 50); // 51 chars total
        Assert.Throws<ArgumentException>(() => paths.TenantPrmServices(slug));
    }

    [Fact]
    public void TenantPrmServices_50CharSlug_Passes()
    {
        var paths = Build();
        var slug = "a" + new string('b', 49); // exactly 50 chars
        var result = paths.TenantPrmServices(slug);
        Assert.Contains(slug, result);
    }
}
