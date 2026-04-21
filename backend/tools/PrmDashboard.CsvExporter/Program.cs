using Microsoft.Extensions.Configuration;
using PrmDashboard.CsvExporter.Export;

return await RunAsync(args);

static async Task<int> RunAsync(string[] args)
{
    if (HasFlag(args, "--help") || HasFlag(args, "-h"))
    {
        PrintHelp();
        return 0;
    }

    var outDir = Path.GetFullPath(GetOption(args, "--out") ?? "./data");
    var masterFromArg = GetOption(args, "--master");
    var tenantHostOverride = GetOption(args, "--tenant-host");

    var config = new ConfigurationBuilder()
        .SetBasePath(AppContext.BaseDirectory)
        .AddJsonFile("appsettings.json", optional: true)
        .AddEnvironmentVariables()
        .Build();

    var masterFromEnv = Environment.GetEnvironmentVariable("MASTER_CONNECTION_STRING");
    var masterFromConfig = config.GetConnectionString("MasterDb");

    var masterConn = FirstNonEmpty(masterFromArg, masterFromEnv, masterFromConfig);
    if (string.IsNullOrWhiteSpace(masterConn))
    {
        Console.Error.WriteLine(
            "ERROR: master connection string not provided. Pass --master \"...\", " +
            "set MASTER_CONNECTION_STRING, or fill ConnectionStrings:MasterDb in appsettings.json.");
        return 2;
    }

    Console.WriteLine($"Output directory: {outDir}");
    Console.WriteLine($"Master DB: {RedactPassword(masterConn)}");
    Console.WriteLine();

    var allResults = new List<TableExportResult>();

    Console.WriteLine("Exporting master tables...");
    allResults.AddRange(await MasterExporter.ExportAllAsync(masterConn, outDir));

    Console.WriteLine("Exporting per-tenant prm_services...");
    allResults.AddRange(await TenantDbExporter.ExportAllAsync(masterConn, outDir, tenantHostOverride));

    Console.WriteLine();
    Console.WriteLine("=== Summary ===");
    Console.WriteLine($"{"Table",-32} {"Rows",8} {"Source",8}  Status  Path");
    foreach (var r in allResults)
    {
        var status = r.Matches ? "OK" : "MISMATCH";
        Console.WriteLine($"{r.Label,-32} {r.RowsWritten,8} {r.SourceCount,8}  {status,-8} {r.OutputPath}");
    }

    var mismatches = allResults.Where(r => !r.Matches).ToList();
    if (mismatches.Count > 0)
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine($"FAIL: {mismatches.Count} table(s) had row-count mismatches.");
        return 1;
    }

    Console.WriteLine();
    Console.WriteLine("SUCCESS: all row counts match source.");
    return 0;
}

static void PrintHelp()
{
    Console.WriteLine("PrmDashboard.CsvExporter — dump MySQL contents to CSV (phase 1).");
    Console.WriteLine();
    Console.WriteLine("Usage:");
    Console.WriteLine("  dotnet run --project backend/tools/PrmDashboard.CsvExporter -- [options]");
    Console.WriteLine();
    Console.WriteLine("Options:");
    Console.WriteLine("  --out <dir>           Output directory (default: ./data)");
    Console.WriteLine("  --master <str>        Master DB connection string (overrides env + appsettings.json)");
    Console.WriteLine("  --tenant-host <host>  Override db_host for per-tenant connection strings (e.g., \"localhost\" when running outside the docker network; master DB still uses --master / env / appsettings)");
    Console.WriteLine("  -h, --help            Show this help");
    Console.WriteLine();
    Console.WriteLine("Connection string resolution order:");
    Console.WriteLine("  1. --master CLI arg");
    Console.WriteLine("  2. MASTER_CONNECTION_STRING env var");
    Console.WriteLine("  3. appsettings.json -> ConnectionStrings:MasterDb");
}

static string? GetOption(string[] args, string name)
{
    for (int i = 0; i < args.Length - 1; i++)
    {
        if (args[i] == name) return args[i + 1];
    }
    return null;
}

static bool HasFlag(string[] args, string name) => Array.IndexOf(args, name) >= 0;

static string? FirstNonEmpty(params string?[] values)
    => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

static string RedactPassword(string connString)
{
    // Replace anything after "Password=" up to the next ';' with "****"
    var idx = connString.IndexOf("Password=", StringComparison.OrdinalIgnoreCase);
    if (idx < 0) return connString;
    var end = connString.IndexOf(';', idx);
    var replacement = "Password=****";
    return end < 0 ? connString[..idx] + replacement : connString[..idx] + replacement + connString[end..];
}
