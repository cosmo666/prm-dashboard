using System.IO;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class TenantParquetPathsTests
{
    private static TenantParquetPaths Build(string root)
    {
        var options = Options.Create(new DataPathOptions { Root = root });
        return new TenantParquetPaths(options);
    }

    [Fact]
    public void MasterTenants_BuildsRootSlashMasterSlashTenantsParquet()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "tenants.parquet"), paths.MasterTenants);
    }

    [Fact]
    public void MasterEmployees_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "employees.parquet"), paths.MasterEmployees);
    }

    [Fact]
    public void MasterEmployeeAirports_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(Path.Combine("data", "master", "employee_airports.parquet"), paths.MasterEmployeeAirports);
    }

    [Fact]
    public void TenantPrmServices_WithSlug_BuildsExpectedPath()
    {
        var paths = Build("data");
        Assert.Equal(
            Path.Combine("data", "aeroground", "prm_services.parquet"),
            paths.TenantPrmServices("aeroground"));
    }

    [Fact]
    public void TenantPrmServices_WithDifferentSlug_BuildsDifferentPath()
    {
        var paths = Build("data");
        Assert.NotEqual(paths.TenantPrmServices("aeroground"), paths.TenantPrmServices("skyserve"));
    }

    [Fact]
    public void AbsoluteRoot_IsPreservedInOutputs()
    {
        var root = Path.Combine(Path.GetTempPath(), "prm-data-root");
        var paths = Build(root);
        Assert.StartsWith(root, paths.MasterTenants);
        Assert.StartsWith(root, paths.TenantPrmServices("aeroground"));
    }
}
