using MySqlConnector;

namespace PrmDashboard.CsvExporter.Export;

public static class TenantDbExporter
{
    // Full-fidelity dump of prm_services. Column order must be stable for diffing.
    private const string PrmServicesSql = """
        SELECT row_id, id, flight, flight_number, agent_name, agent_no,
               passenger_name, prm_agent_type, start_time, paused_at, end_time,
               service, seat_number, scanned_by, scanned_by_user, remarks,
               pos_location, no_show_flag, loc_name, arrival, airline,
               emp_type, departure, requested, service_date
        FROM prm_services
        ORDER BY row_id
        """;

    private sealed record ActiveTenant(string Slug, string ConnectionString);

    public static async Task<IReadOnlyList<TableExportResult>> ExportAllAsync(
        string masterConnectionString,
        string outDir,
        string? tenantHostOverride = null,
        CancellationToken ct = default)
    {
        var tenants = await LoadActiveTenantsAsync(masterConnectionString, tenantHostOverride, ct);

        var results = new List<TableExportResult>();
        foreach (var t in tenants)
        {
            var outPath = Path.Combine(outDir, t.Slug, "prm_services.csv");
            var result = await TableExporter.ExportAsync(
                t.ConnectionString,
                label: $"{t.Slug}.prm_services",
                selectSql: PrmServicesSql,
                outputPath: outPath,
                ct: ct);
            results.Add(result);
        }

        return results;
    }

    private static async Task<IReadOnlyList<ActiveTenant>> LoadActiveTenantsAsync(
        string masterConnectionString,
        string? tenantHostOverride,
        CancellationToken ct)
    {
        const string sql = """
            SELECT slug, db_host, db_port, db_name, db_user, db_password
            FROM tenants
            WHERE is_active = 1
            ORDER BY id
            """;

        await using var conn = new MySqlConnection(masterConnectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await using var reader = await cmd.ExecuteReaderAsync(ct);

        var list = new List<ActiveTenant>();
        while (await reader.ReadAsync(ct))
        {
            var slug = reader.GetString(0);
            var host = reader.GetString(1);
            var port = reader.GetInt32(2);
            var db = reader.GetString(3);
            var user = reader.GetString(4);
            var pwd = reader.GetString(5);
            var effectiveHost = tenantHostOverride ?? host;
            list.Add(new ActiveTenant(slug, $"Server={effectiveHost};Port={port};Database={db};User={user};Password={pwd}"));
        }
        return list;
    }
}
