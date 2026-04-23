using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace PrmDashboard.Shared.Data;

/// <summary>
/// Constructs absolute-or-relative filesystem paths to the Parquet files in the
/// data layout produced by <c>PrmDashboard.ParquetBuilder</c>:
/// <code>
/// {Root}/master/tenants.parquet
/// {Root}/master/employees.parquet
/// {Root}/master/employee_airports.parquet
/// {Root}/{slug}/prm_services.parquet
/// </code>
/// Registered as a singleton; pure, thread-safe.
/// </summary>
public sealed class TenantParquetPaths
{
    /// <summary>
    /// Valid tenant-slug pattern: 1–50 lowercase alphanumerics + hyphens; must
    /// start with a letter. Matches the subdomain format the gateway extracts
    /// and the slug format seeded in <c>master/tenants.parquet</c>. Enforcing
    /// this before <see cref="Path.Combine"/> blocks path-traversal sequences
    /// like <c>../../etc</c> from resolving the data path outside <c>{Root}</c>.
    /// </summary>
    private static readonly Regex SlugFormat = new(
        @"^[a-z][a-z0-9-]{0,49}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly string _root;

    public TenantParquetPaths(IOptions<DataPathOptions> options)
    {
        _root = options.Value.Root;
    }

    public string MasterTenants => Path.Combine(_root, "master", "tenants.parquet");
    public string MasterEmployees => Path.Combine(_root, "master", "employees.parquet");
    public string MasterEmployeeAirports => Path.Combine(_root, "master", "employee_airports.parquet");

    /// <summary>
    /// Escapes single quotes for safe interpolation into DuckDB SQL string
    /// literals (<c>FROM '{path}'</c>). The canonical helper used by every
    /// service that embeds one of this class's paths into a query string.
    /// </summary>
    public static string EscapeSqlLiteral(string path) => path.Replace("'", "''");

    /// <summary>
    /// Returns the per-tenant Parquet path. Throws
    /// <see cref="ArgumentException"/> if the slug doesn't match the allowed
    /// format — this is the last-line-of-defense against path traversal or
    /// other injection through a malformed <c>X-Tenant-Slug</c> header.
    /// </summary>
    public string TenantPrmServices(string slug)
    {
        if (string.IsNullOrWhiteSpace(slug) || !SlugFormat.IsMatch(slug))
            throw new ArgumentException(
                $"Invalid tenant slug '{slug}'. Slugs must be 1–50 lowercase " +
                "alphanumerics + hyphens, starting with a letter.",
                nameof(slug));
        return Path.Combine(_root, slug, "prm_services.parquet");
    }
}
