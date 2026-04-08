using PrmDashboard.TenantService.Services;
using Xunit;

namespace PrmDashboard.Tests.TenantService;

/// <summary>
/// Verifies <see cref="SchemaMigrator.LoadEmbeddedMigrations"/> discovers the
/// embedded SQL files shipped with the TenantService and parses the version
/// prefix (NNN) correctly. This method is exposed to the test assembly via
/// [InternalsVisibleTo("PrmDashboard.Tests")].
/// </summary>
public class SchemaMigratorFilenameTests
{
    [Fact]
    public void LoadEmbeddedMigrations_FindsAtLeastOneMigration()
    {
        var migrations = SchemaMigrator.LoadEmbeddedMigrations();

        Assert.NotEmpty(migrations);
    }

    [Fact]
    public void LoadEmbeddedMigrations_FirstMigrationIsVersion001_WithPrmServicesDdl()
    {
        var migrations = SchemaMigrator.LoadEmbeddedMigrations();

        // The first committed migration is 001_create_prm_services.sql
        var first = migrations.First();
        Assert.Equal("001", first.Version);

        // Sanity-check the DDL references the target table (implementation-agnostic)
        Assert.Contains("prm_services", first.Sql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void LoadEmbeddedMigrations_VersionsAreSortedAscending()
    {
        var migrations = SchemaMigrator.LoadEmbeddedMigrations();

        var versions = migrations.Select(m => m.Version).ToList();
        var sorted = versions.OrderBy(v => v, StringComparer.Ordinal).ToList();

        Assert.Equal(sorted, versions);
    }
}
