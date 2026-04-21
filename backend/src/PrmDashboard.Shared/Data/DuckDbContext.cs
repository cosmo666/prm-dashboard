using System.Data;
using DuckDB.NET.Data;
using Microsoft.Extensions.ObjectPool;
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Hands out pooled DuckDB connections. Intended to be registered as a singleton.
/// Each connection is an isolated <c>:memory:</c> DuckDB engine; Parquet files are
/// read as external tables via path literals. Connections are thread-UNSAFE for
/// concurrent command execution — use one session per concurrent query.
/// </summary>
public interface IDuckDbContext
{
    /// <summary>
    /// Acquires a pooled connection. The returned session opens the connection if
    /// not already open, and returns it to the pool on dispose.
    /// </summary>
    Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default);
}

public sealed class DuckDbContext : IDuckDbContext
{
    private readonly ObjectPool<DuckDBConnection> _pool;

    public DuckDbContext(IOptions<DataPathOptions> options)
    {
        var poolSize = options.Value.PoolSize;
        if (poolSize < DataPathOptions.MinPoolSize || poolSize > DataPathOptions.MaxPoolSize)
        {
            throw new ArgumentOutOfRangeException(
                nameof(options),
                $"DataPath:PoolSize must be between {DataPathOptions.MinPoolSize} and {DataPathOptions.MaxPoolSize}, got {poolSize}.");
        }

        var provider = new DefaultObjectPoolProvider { MaximumRetained = poolSize };
        _pool = provider.Create(new DuckDbConnectionPolicy());
    }

    public async Task<PooledDuckDbSession> AcquireAsync(CancellationToken ct = default)
    {
        var conn = _pool.Get();
        if (conn.State != ConnectionState.Open)
            await conn.OpenAsync(ct);
        return new PooledDuckDbSession(conn, _pool);
    }

    /// <summary>
    /// Pool policy — constructs fresh in-memory connections on demand, allows
    /// unconditional return to the pool after use.
    /// </summary>
    private sealed class DuckDbConnectionPolicy : PooledObjectPolicy<DuckDBConnection>
    {
        public override DuckDBConnection Create() => new DuckDBConnection("DataSource=:memory:");

        // Unconditional return is safe for in-memory DuckDB: there's no network to fail,
        // and AcquireAsync checks ConnectionState.Open + calls OpenAsync on broken/closed
        // connections, so a potentially-broken connection in the pool is self-healing.
        public override bool Return(DuckDBConnection obj) => true;
    }
}
