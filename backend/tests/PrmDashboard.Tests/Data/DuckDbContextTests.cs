using System.Collections.Concurrent;
using System.Data;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Options;
using PrmDashboard.Shared.Data;
using Xunit;

namespace PrmDashboard.Tests.Data;

public class DuckDbContextTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private string _parquetPath = "";

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"duckdb-ctx-{System.Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
        _parquetPath = Path.Combine(_tempRoot, "fixture.parquet");

        // Write a fixture Parquet file with 5 rows via DuckDB itself.
        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();
        await using var cmd = setupConn.CreateCommand();
        cmd.CommandText =
            $"COPY (SELECT range AS id FROM range(5)) TO '{_parquetPath.Replace("'", "''")}' (FORMAT 'parquet')";
        await cmd.ExecuteNonQueryAsync();
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    private static DuckDbContext Build(int poolSize = 4)
    {
        var options = Options.Create(new DataPathOptions { Root = "unused-for-ctx-tests", PoolSize = poolSize });
        return new DuckDbContext(options);
    }

    [Fact]
    public async Task AcquireAsync_ReturnsOpenConnection()
    {
        var ctx = Build();
        await using var session = await ctx.AcquireAsync();
        Assert.Equal(ConnectionState.Open, session.Connection.State);
    }

    [Fact]
    public async Task AcquireAsync_CanQueryExternalParquet()
    {
        var ctx = Build();
        await using var session = await ctx.AcquireAsync();
        await using var cmd = session.Connection.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM '{_parquetPath.Replace("'", "''")}'";
        var count = System.Convert.ToInt64(await cmd.ExecuteScalarAsync());
        Assert.Equal(5L, count);
    }

    [Fact]
    public async Task DisposedSession_ReturnsConnectionToPool_NextAcquireReusesSameInstance()
    {
        var ctx = Build(poolSize: 1);
        DuckDBConnection first;
        await using (var s1 = await ctx.AcquireAsync())
        {
            first = s1.Connection;
        }
        await using var s2 = await ctx.AcquireAsync();
        Assert.Same(first, s2.Connection);
    }

    [Fact]
    public async Task ConcurrentAcquires_ReturnDistinctConnections()
    {
        var ctx = Build(poolSize: 8);
        var sessions = new ConcurrentBag<PooledDuckDbSession>();

        try
        {
            var tasks = Enumerable.Range(0, 8).Select(async _ =>
            {
                var session = await ctx.AcquireAsync();
                sessions.Add(session);
            }).ToArray();

            await Task.WhenAll(tasks);

            var connections = sessions.Select(s => s.Connection).ToList();
            Assert.Equal(8, connections.Count);
            Assert.Equal(8, connections.Distinct().Count()); // all distinct instances
        }
        finally
        {
            foreach (var s in sessions) await s.DisposeAsync();
        }
    }

    [Fact]
    public async Task ConcurrentQueries_AllComplete_AndProduceCorrectResults()
    {
        // Regression guard: confirms that multiple sessions can query simultaneously
        // without deadlock or cross-session corruption. This is the behavior the pool exists for.
        var ctx = Build(poolSize: 4);
        var countPath = _parquetPath.Replace("'", "''");

        var tasks = Enumerable.Range(0, 10).Select(async _ =>
        {
            await using var session = await ctx.AcquireAsync();
            await using var cmd = session.Connection.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(*) FROM '{countPath}'";
            return System.Convert.ToInt64(await cmd.ExecuteScalarAsync());
        }).ToArray();

        var results = await Task.WhenAll(tasks);
        Assert.All(results, r => Assert.Equal(5L, r));
    }

    [Fact]
    public async Task DoubleDispose_DoesNotDoubleReturnToPool()
    {
        var ctx = Build(poolSize: 1);
        var session = await ctx.AcquireAsync();
        await session.DisposeAsync();
        await session.DisposeAsync(); // must be a no-op

        // If dispose double-returned, the pool would have two instances and the next acquire
        // could pick either. We just verify that acquire still works and yields an open conn.
        await using var next = await ctx.AcquireAsync();
        Assert.Equal(ConnectionState.Open, next.Connection.State);
    }

    [Fact]
    public void Ctor_RejectsPoolSizeBelowMin()
    {
        var options = Options.Create(new DataPathOptions { PoolSize = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new DuckDbContext(options));
    }

    [Fact]
    public void Ctor_RejectsPoolSizeAboveMax()
    {
        var options = Options.Create(new DataPathOptions { PoolSize = 65 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new DuckDbContext(options));
    }
}
