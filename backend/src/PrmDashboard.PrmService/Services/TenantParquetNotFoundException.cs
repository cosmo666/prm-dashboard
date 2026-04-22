namespace PrmDashboard.PrmService.Services;

/// <summary>
/// Thrown when a tenant's <c>prm_services.parquet</c> file is missing on disk.
/// Caught by <c>ExceptionHandlerMiddleware</c> and translated to HTTP 404 so a
/// newly provisioned tenant whose data hasn't been generated yet doesn't crash
/// the request with an opaque DuckDB IO error.
/// </summary>
public sealed class TenantParquetNotFoundException : Exception
{
    public string TenantSlug { get; }

    public TenantParquetNotFoundException(string tenantSlug, string path)
        : base($"PRM data file not found for tenant '{tenantSlug}' at '{path}'")
    {
        TenantSlug = tenantSlug;
    }
}
