using System.Reflection;
using MySqlConnector;

namespace PrmDashboard.TenantService.Services;

/// <summary>
/// Applies embedded SQL migrations to tenant databases on first use.
/// Ensures runtime tenant onboarding: attach a DB, insert a tenant row,
/// and the schema bootstraps automatically on first request.
/// </summary>
public class SchemaMigrator
{
    // Process-global lock — serializes ALL tenant migrations. Acceptable for POC (3 tenants).
    // For production with many tenants, replace with ConcurrentDictionary<string, SemaphoreSlim> keyed on DB name.
    private static readonly SemaphoreSlim Guard = new(1, 1);
    private readonly ILogger<SchemaMigrator> _logger;

    public SchemaMigrator(ILogger<SchemaMigrator> logger)
    {
        _logger = logger;
    }

    public async Task RunAsync(string connectionString, CancellationToken ct = default)
    {
        await Guard.WaitAsync(ct);
        try
        {
            await using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync(ct);

            _logger.LogInformation("Running schema migrations against {DataSource}", conn.DataSource);

            // Ensure the tracker table exists
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version VARCHAR(10) NOT NULL PRIMARY KEY,
                        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """;
                await cmd.ExecuteNonQueryAsync(ct);
            }

            // Load already-applied versions
            var applied = new HashSet<string>();
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT version FROM schema_migrations";
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    applied.Add(reader.GetString(0));
                }
            }

            // Load and sort embedded migration files
            var migrations = LoadEmbeddedMigrations();

            foreach (var (version, sql) in migrations)
            {
                if (applied.Contains(version))
                    continue;

                _logger.LogInformation("Applying migration {Version} to {DataSource}", version, conn.DataSource);

                // NOTE: MySQL auto-commits DDL statements (CREATE TABLE, ALTER TABLE, etc.)
                // regardless of the surrounding transaction. The transaction here protects only
                // the tracker INSERT. Migration SQL MUST be idempotent (use IF NOT EXISTS).
                await using var tx = await conn.BeginTransactionAsync(ct);
                try
                {
                    await using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = sql;
                        await cmd.ExecuteNonQueryAsync(ct);
                    }

                    await using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = "INSERT INTO schema_migrations (version) VALUES (@version)";
                        cmd.Parameters.AddWithValue("@version", version);
                        await cmd.ExecuteNonQueryAsync(ct);
                    }

                    await tx.CommitAsync(ct);
                    _logger.LogInformation("Migration {Version} applied successfully", version);
                }
                catch (Exception ex)
                {
                    await tx.RollbackAsync(ct);
                    _logger.LogError(ex, "Migration {Version} failed, rolled back", version);
                    throw;
                }
            }
        }
        finally
        {
            Guard.Release();
        }
    }

    /// <summary>
    /// Loads embedded SQL migrations sorted by filename. Convention: files must be named
    /// NNN_description.sql where NNN is a zero-padded 3-digit ordinal. Lexicographic sort
    /// of resource names (embedded as PrmDashboard.TenantService.Schema.Migrations.NNN_...)
    /// matches execution order because of the zero-padding.
    /// </summary>
    internal static List<(string Version, string Sql)> LoadEmbeddedMigrations()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceNames = assembly.GetManifestResourceNames()
            .Where(n => n.Contains("Schema.Migrations.") && n.EndsWith(".sql"))
            .OrderBy(n => n)
            .ToList();

        var migrations = new List<(string Version, string Sql)>();

        var prefix = $"{assembly.GetName().Name}.Schema.Migrations.";

        foreach (var resourceName in resourceNames)
        {
            // Resource name: PrmDashboard.TenantService.Schema.Migrations.001_create_prm_services.sql
            // Strip known prefix and ".sql" suffix to get the bare filename
            var fileName = resourceName[prefix.Length..^4]; // e.g. "001_create_prm_services"
            var version = fileName.Split('_')[0]; // "001"

            using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"Could not load migration resource: {resourceName}");
            using var reader = new StreamReader(stream);
            var sql = reader.ReadToEnd();

            migrations.Add((version, sql));
        }

        return migrations;
    }
}
