namespace PrmDashboard.CsvExporter.Export;

public static class MasterExporter
{
    // Full-fidelity column lists (phase 1 dumps everything; phase 3 prunes vestigial cols).
    private const string TenantsSql = """
        SELECT id, name, slug, db_host, db_port, db_name, db_user, db_password,
               is_active, created_at, logo_url, primary_color
        FROM tenants
        ORDER BY id
        """;

    private const string EmployeesSql = """
        SELECT id, tenant_id, username, password_hash, display_name, email,
               is_active, created_at, last_login
        FROM employees
        ORDER BY id
        """;

    private const string EmployeeAirportsSql = """
        SELECT id, employee_id, airport_code, airport_name
        FROM employee_airports
        ORDER BY id
        """;

    public static async Task<IReadOnlyList<TableExportResult>> ExportAllAsync(
        string masterConnectionString,
        string outDir,
        CancellationToken ct = default)
    {
        var masterDir = Path.Combine(outDir, "master");

        var results = new List<TableExportResult>
        {
            await TableExporter.ExportAsync(
                masterConnectionString,
                label: "master.tenants",
                selectSql: TenantsSql,
                outputPath: Path.Combine(masterDir, "tenants.csv"),
                ct: ct),

            await TableExporter.ExportAsync(
                masterConnectionString,
                label: "master.employees",
                selectSql: EmployeesSql,
                outputPath: Path.Combine(masterDir, "employees.csv"),
                ct: ct),

            await TableExporter.ExportAsync(
                masterConnectionString,
                label: "master.employee_airports",
                selectSql: EmployeeAirportsSql,
                outputPath: Path.Combine(masterDir, "employee_airports.csv"),
                ct: ct),
        };

        return results;
    }
}
