namespace PrmDashboard.Shared.Data;

/// <summary>
/// Runtime configuration for DuckDB/Parquet data access.
/// Populated via <see cref="Microsoft.Extensions.DependencyInjection.OptionsServiceCollectionExtensions"/>
/// <c>Configure&lt;DataPathOptions&gt;</c> in each service's <c>Program.cs</c>.
/// </summary>
public sealed class DataPathOptions
{
    public const string SectionName = "DataPath";
    public const int DefaultPoolSize = 16;
    public const int MinPoolSize = 1;
    public const int MaxPoolSize = 64;

    /// <summary>
    /// Absolute or relative path to the <c>data/</c> folder containing <c>master/*.parquet</c>
    /// and per-tenant <c>{slug}/prm_services.parquet</c>. Required; empty string fails startup
    /// validation.
    /// </summary>
    public string Root { get; set; } = "";

    /// <summary>
    /// Maximum number of <c>DuckDBConnection</c> instances retained in the pool. Tune for
    /// concurrent-user load; bounds are <see cref="MinPoolSize"/>..<see cref="MaxPoolSize"/>.
    /// </summary>
    public int PoolSize { get; set; } = DefaultPoolSize;
}
