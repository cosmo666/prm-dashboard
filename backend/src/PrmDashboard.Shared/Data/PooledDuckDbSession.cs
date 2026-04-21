using DuckDB.NET.Data;
using Microsoft.Extensions.ObjectPool;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Borrows a <see cref="DuckDBConnection"/> from the <see cref="IDuckDbContext"/> pool.
/// Callers use <see cref="Connection"/> directly for ADO.NET work, then rely on
/// <c>await using</c> to return the connection to the pool on <see cref="DisposeAsync"/>.
/// Sessions are NOT thread-safe — use one session per concurrent unit of work.
/// </summary>
public sealed class PooledDuckDbSession : IAsyncDisposable
{
    public DuckDBConnection Connection { get; }
    private readonly ObjectPool<DuckDBConnection> _pool;
    private int _disposed;

    internal PooledDuckDbSession(DuckDBConnection connection, ObjectPool<DuckDBConnection> pool)
    {
        Connection = connection;
        _pool = pool;
    }

    public ValueTask DisposeAsync()
    {
        // Interlocked.Exchange returns 0 on the first dispose (then sets to 1);
        // concurrent/subsequent calls see 1 and skip the Return. Prevents a race
        // where two DisposeAsync calls both return the same connection to the pool.
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return ValueTask.CompletedTask;
        _pool.Return(Connection);
        return ValueTask.CompletedTask;
    }
}
