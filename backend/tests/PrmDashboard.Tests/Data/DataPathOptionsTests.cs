using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DataPathOptionsTests
{
    [Fact]
    public void SectionName_IsExpectedValue()
    {
        Assert.Equal("DataPath", DataPathOptions.SectionName);
    }

    [Fact]
    public void DefaultPoolSize_Is16()
    {
        Assert.Equal(16, DataPathOptions.DefaultPoolSize);
    }

    [Fact]
    public void MinPoolSize_Is1()
    {
        Assert.Equal(1, DataPathOptions.MinPoolSize);
    }

    [Fact]
    public void MaxPoolSize_Is64()
    {
        Assert.Equal(64, DataPathOptions.MaxPoolSize);
    }

    [Fact]
    public void DefaultInstance_HasEmptyRoot_AndDefaultPoolSize()
    {
        var opts = new DataPathOptions();
        Assert.Equal("", opts.Root);
        Assert.Equal(DataPathOptions.DefaultPoolSize, opts.PoolSize);
    }

    [Fact]
    public void Properties_AreMutable()
    {
        // Options classes must be mutable so IConfiguration + Configure<T> can bind into them.
        var opts = new DataPathOptions { Root = "/tmp/data", PoolSize = 8 };
        Assert.Equal("/tmp/data", opts.Root);
        Assert.Equal(8, opts.PoolSize);
    }
}
