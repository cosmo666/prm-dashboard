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
    private readonly string _root;

    public TenantParquetPaths(IOptions<DataPathOptions> options)
    {
        _root = options.Value.Root;
    }

    public string MasterTenants => Path.Combine(_root, "master", "tenants.parquet");
    public string MasterEmployees => Path.Combine(_root, "master", "employees.parquet");
    public string MasterEmployeeAirports => Path.Combine(_root, "master", "employee_airports.parquet");
    public string TenantPrmServices(string slug) => Path.Combine(_root, slug, "prm_services.parquet");
}
