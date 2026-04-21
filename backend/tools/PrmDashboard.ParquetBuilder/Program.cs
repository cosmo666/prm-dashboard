using PrmDashboard.ParquetBuilder.Build;

return await RunAsync(args);

static async Task<int> RunAsync(string[] args)
{
    if (HasFlag(args, "--help") || HasFlag(args, "-h"))
    {
        PrintHelp();
        return 0;
    }

    var dir = GetOption(args, "--dir");
    if (string.IsNullOrWhiteSpace(dir))
    {
        Console.Error.WriteLine("ERROR: --dir is required. Example: --dir ./data");
        return 2;
    }

    var absDir = Path.GetFullPath(dir);
    if (!Directory.Exists(absDir))
    {
        Console.Error.WriteLine($"ERROR: directory not found: {absDir}");
        return 2;
    }

    Console.WriteLine($"Input directory: {absDir}");
    Console.WriteLine();

    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        if (!cts.IsCancellationRequested)
        {
            e.Cancel = true;
            Console.Error.WriteLine();
            Console.Error.WriteLine("Cancellation requested — finishing current file. Press Ctrl-C again to force-quit.");
            cts.Cancel();
        }
    };

    var csvFiles = FileDiscovery.FindCsvFiles(absDir).OrderBy(p => p).ToList();
    if (csvFiles.Count == 0)
    {
        Console.Error.WriteLine("ERROR: no .csv files found under the specified directory.");
        return 2;
    }

    Console.WriteLine($"Found {csvFiles.Count} CSV file(s). Converting...");
    Console.WriteLine();

    var results = new List<ConversionResult>();
    foreach (var csvPath in csvFiles)
    {
        var parquetPath = FileDiscovery.CsvToParquetPath(csvPath);
        var result = await ParquetConverter.ConvertAsync(csvPath, parquetPath, cts.Token);
        results.Add(result);
    }

    Console.WriteLine("=== Summary ===");
    Console.WriteLine($"{"File",-60} {"CSV rows",10} {"Parquet rows",12}  Status");
    foreach (var r in results)
    {
        var status = r.Matches ? "OK" : "MISMATCH";
        var rel = Path.GetRelativePath(absDir, r.ParquetPath);
        Console.WriteLine($"{rel,-60} {r.CsvRows,10} {r.ParquetRows,12}  {status}");
    }

    var mismatches = results.Where(r => !r.Matches).ToList();
    if (mismatches.Count > 0)
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine($"FAIL: {mismatches.Count} file(s) had row-count mismatches.");
        return 1;
    }

    Console.WriteLine();
    Console.WriteLine("SUCCESS: all row counts match source.");
    return 0;
}

static void PrintHelp()
{
    Console.WriteLine("PrmDashboard.ParquetBuilder — convert CSV files to Parquet via DuckDB (phase 2).");
    Console.WriteLine();
    Console.WriteLine("Usage:");
    Console.WriteLine("  dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir <path>");
    Console.WriteLine();
    Console.WriteLine("Options:");
    Console.WriteLine("  --dir <path>   Root directory to walk for *.csv files (required)");
    Console.WriteLine("  -h, --help     Show this help");
    Console.WriteLine();
    Console.WriteLine("Behavior:");
    Console.WriteLine("  Walks <path> recursively. For each file.csv, writes file.parquet next to it.");
    Console.WriteLine("  Existing .parquet files are overwritten. Each conversion is verified by");
    Console.WriteLine("  comparing SELECT COUNT(*) over the CSV and the freshly written Parquet.");
    Console.WriteLine();
    Console.WriteLine("Exit codes:");
    Console.WriteLine("  0  all row counts match source");
    Console.WriteLine("  1  one or more files had a row-count mismatch");
    Console.WriteLine("  2  --dir missing, directory not found, or no .csv files found");
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
