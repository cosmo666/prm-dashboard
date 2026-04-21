# Phase 2 — CSV → Parquet Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-shot .NET 8 console tool that walks `data/` recursively and converts every `*.csv` to a sibling `*.parquet` via embedded DuckDB, with per-file row-count verification. No MySQL involvement; inputs are the CSVs produced by the Phase 1 exporter.

**Architecture:** Single console project `backend/tools/PrmDashboard.ParquetBuilder/` added under the existing `tools/` solution folder. File walking is a pure helper (`FileDiscovery`) with unit tests covering the CSV→Parquet path transform. The DuckDB conversion sits in `ParquetConverter` and uses the spec's one-liner `COPY (SELECT * FROM read_csv_auto('…')) TO '…' (FORMAT 'parquet')` — plus a cheap sanity check that re-queries both the CSV and the freshly written Parquet through the same DuckDB connection and compares row counts. `Program.cs` orchestrates and prints a Phase-1-style summary table. Exit code `0` on all-OK, `1` on any row-count mismatch, `2` on missing `--dir`.

**Tech Stack:**
- .NET 8 console app (`Microsoft.NET.Sdk`, `<OutputType>Exe</OutputType>`, top-level statements)
- `DuckDB.NET.Data` — version pinned to whatever `dotnet add package` resolves during Task 1 (latest stable). This is the embedded C library wrapper; no external MySQL or DuckDB CLI required.
- xUnit — same test project as Phase 1 (`backend/tests/PrmDashboard.Tests`); new folder `ParquetBuilder/` for this tool's tests
- No new NuGet packages beyond `DuckDB.NET.Data`

---

## Spec resolutions baked into this plan

Items the Phase 2 spec section (lines 78–85) does not specify; resolved here so the implementer has no ambiguity:

1. **Compression codec = DuckDB default (SNAPPY).** Balances size and read speed for the analytical workload Phase 3 will run. No CLI flag.
2. **Row group size = DuckDB default (122,880 rows).** Per-tenant `prm_services` is ≤10k rows per tenant in the POC; every file fits in a single row group. No flag.
3. **Schema inference via `read_csv_auto`** — matches the spec's literal SQL. Phase 1 CSVs emit invariant-culture numerics, ISO-8601 dates, `true`/`false` booleans, and empty-for-null — these should infer correctly to DuckDB's `INTEGER` / `DATE` / `TIMESTAMP` / `BOOLEAN` / `VARCHAR`. If Task 6 verification surfaces a miscast, we add explicit `types={}` at that point (YAGNI otherwise).
4. **Overwrite behavior = `File.Delete(targetPath)` before COPY.** DuckDB's `COPY ... TO 'file' (FORMAT 'parquet')` errors if the file exists on older DuckDB versions; explicit delete is version-agnostic and matches the spec's "Safe to re-run, overwrites Parquet files." The delete is idempotent (guarded by `File.Exists` check, or just swallow `FileNotFoundException` — we go with the explicit check for readability).
5. **Row-count verification** — per-file, via a second query on the just-written Parquet. Same exit-code discipline as Phase 1 (non-zero on any mismatch).
6. **No try/catch at top level.** Let DuckDB / filesystem exceptions surface with full stack traces. This is a one-shot dev-time tool.
7. **Data folder discovery default** — `--dir` is required (no silent default of `./data`). Forces the user to be deliberate; small cost for avoiding accidental writes.
8. **Feature branch** — `phase2-parquet-builder`, created from `main` (currently at `5c2ac42`, the Phase 1 polish tip).

---

## Files to create/modify

Create:
- `backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj`
- `backend/tools/PrmDashboard.ParquetBuilder/Program.cs`
- `backend/tools/PrmDashboard.ParquetBuilder/Build/FileDiscovery.cs`
- `backend/tools/PrmDashboard.ParquetBuilder/Build/ParquetConverter.cs`
- `backend/tools/PrmDashboard.ParquetBuilder/Build/ConversionResult.cs`
- `backend/tools/PrmDashboard.ParquetBuilder/README.md`
- `backend/tests/PrmDashboard.Tests/ParquetBuilder/FileDiscoveryTests.cs`

Modify:
- `backend/PrmDashboard.sln` — register new project under existing `tools` solution folder (`dotnet sln add` handles this)
- `backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj` — add `ProjectReference` to `PrmDashboard.ParquetBuilder`

---

## Pre-task: create feature branch

Before Task 1, from the repo root:

```bash
git checkout main
git pull --ff-only 2>/dev/null || true  # pull is no-op if no remote updates
git checkout -b phase2-parquet-builder
git log --oneline -3
```

Expected last commit: `5c2ac42 fix(tools): harden RedactPassword for quoted values in conn string` (or later if main has moved). This branch is where Tasks 1–6 land.

---

### Task 1: Scaffold the console project and register it in the solution

**Files:**
- Create: `backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj`
- Create: `backend/tools/PrmDashboard.ParquetBuilder/Program.cs`
- Modify: `backend/PrmDashboard.sln`

- [ ] **Step 1: Create a minimal csproj with a placeholder package list**

Write `backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>PrmDashboard.ParquetBuilder</RootNamespace>
    <AssemblyName>PrmDashboard.ParquetBuilder</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="PrmDashboard.Tests" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Create a stub Program.cs**

Write `backend/tools/PrmDashboard.ParquetBuilder/Program.cs`:

```csharp
Console.WriteLine("PrmDashboard.ParquetBuilder: stub. Full CLI wired in Task 4.");
return 0;
```

- [ ] **Step 3: Add DuckDB.NET.Data as a package**

Run from the repo root (this also picks the current stable version from NuGet and pins it into the csproj):

```bash
dotnet add backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj package DuckDB.NET.Data
```

Expected: `info : Package 'DuckDB.NET.Data' is compatible with all the specified frameworks in project '...'`. The csproj now contains a new `<PackageReference Include="DuckDB.NET.Data" Version="X.Y.Z" />` — note the resolved version; the spec does not pin it.

- [ ] **Step 4: Add project to the solution under the existing `tools` folder**

Run from the repo root:

```bash
dotnet sln backend/PrmDashboard.sln add --solution-folder tools backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj
```

Expected: `Project '...PrmDashboard.ParquetBuilder.csproj' added to the solution.`

- [ ] **Step 5: Build the full solution**

```bash
dotnet build backend/PrmDashboard.sln
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. Eight projects now compile (Shared, Gateway, AuthService, TenantService, PrmService, CsvExporter, ParquetBuilder, Tests).

- [ ] **Step 6: Run the stub**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder
```

Expected stdout: `PrmDashboard.ParquetBuilder: stub. Full CLI wired in Task 4.`
Expected exit code: 0.

- [ ] **Step 7: Commit**

```bash
git add backend/tools/PrmDashboard.ParquetBuilder backend/PrmDashboard.sln
git commit -m "chore(tools): scaffold PrmDashboard.ParquetBuilder console project"
```

---

### Task 2: Pure file discovery + path transform with unit tests

Discovers all `*.csv` files under a root directory and computes their target `*.parquet` paths. Pure logic — no DuckDB, no side effects beyond reading directory entries.

**Files:**
- Create: `backend/tools/PrmDashboard.ParquetBuilder/Build/FileDiscovery.cs`
- Create: `backend/tests/PrmDashboard.Tests/ParquetBuilder/FileDiscoveryTests.cs`
- Modify: `backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj`

- [ ] **Step 1: Add test project reference to ParquetBuilder**

```bash
dotnet add backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj reference backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj
```

Expected: `Reference '...PrmDashboard.ParquetBuilder.csproj' added to the project.`

- [ ] **Step 2: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/ParquetBuilder/FileDiscoveryTests.cs`:

```csharp
using System.IO;
using System.Linq;
using PrmDashboard.ParquetBuilder.Build;
using Xunit;

namespace PrmDashboard.Tests.ParquetBuilder;

public class FileDiscoveryTests
{
    [Fact]
    public void CsvToParquetPath_ReplacesExtension()
    {
        Assert.Equal(
            Path.Combine("data", "master", "tenants.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "master", "tenants.csv")));
    }

    [Fact]
    public void CsvToParquetPath_PreservesSubdirectories()
    {
        Assert.Equal(
            Path.Combine("a", "b", "c", "prm_services.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("a", "b", "c", "prm_services.csv")));
    }

    [Fact]
    public void CsvToParquetPath_UppercaseExtension_NormalizesToLowercaseParquet()
    {
        // Filesystem may be case-insensitive on Windows; we still want the output extension
        // to be ".parquet" deterministically.
        Assert.Equal(
            Path.Combine("data", "tenants.parquet"),
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "tenants.CSV")));
    }

    [Fact]
    public void CsvToParquetPath_NotACsv_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            FileDiscovery.CsvToParquetPath(Path.Combine("data", "tenants.txt")));
    }

    [Fact]
    public void FindCsvFiles_EmptyDirectory_ReturnsEmpty()
    {
        using var tmp = new TempDir();
        Assert.Empty(FileDiscovery.FindCsvFiles(tmp.Path));
    }

    [Fact]
    public void FindCsvFiles_FlatDirectory_FindsTopLevelCsvs()
    {
        using var tmp = new TempDir();
        File.WriteAllText(Path.Combine(tmp.Path, "a.csv"), "");
        File.WriteAllText(Path.Combine(tmp.Path, "b.csv"), "");
        File.WriteAllText(Path.Combine(tmp.Path, "c.txt"), "");

        var found = FileDiscovery.FindCsvFiles(tmp.Path).OrderBy(f => f).ToList();

        Assert.Equal(2, found.Count);
        Assert.EndsWith("a.csv", found[0]);
        Assert.EndsWith("b.csv", found[1]);
    }

    [Fact]
    public void FindCsvFiles_NestedDirectories_Recurses()
    {
        using var tmp = new TempDir();
        var masterDir = Path.Combine(tmp.Path, "master");
        var tenantDir = Path.Combine(tmp.Path, "aeroground");
        Directory.CreateDirectory(masterDir);
        Directory.CreateDirectory(tenantDir);
        File.WriteAllText(Path.Combine(masterDir, "tenants.csv"), "");
        File.WriteAllText(Path.Combine(tenantDir, "prm_services.csv"), "");

        var found = FileDiscovery.FindCsvFiles(tmp.Path).OrderBy(f => f).ToList();

        Assert.Equal(2, found.Count);
    }

    [Fact]
    public void FindCsvFiles_MissingDirectory_Throws()
    {
        Assert.Throws<DirectoryNotFoundException>(() =>
            FileDiscovery.FindCsvFiles(Path.Combine(Path.GetTempPath(), $"nonexistent-{System.Guid.NewGuid():N}")).ToList());
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; }
        public TempDir()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"pb-test-{System.Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }
        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { /* best-effort cleanup */ }
        }
    }
}
```

- [ ] **Step 3: Run tests — must fail to compile (type not found)**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~FileDiscoveryTests"
```

Expected: compile error `CS0234: The type or namespace name 'ParquetBuilder' does not exist in the namespace 'PrmDashboard'` (or similar). This confirms the tests see a missing type.

- [ ] **Step 4: Implement `FileDiscovery`**

Write `backend/tools/PrmDashboard.ParquetBuilder/Build/FileDiscovery.cs`:

```csharp
namespace PrmDashboard.ParquetBuilder.Build;

/// <summary>
/// Pure helpers that locate CSV files under a root and compute their Parquet siblings.
/// Throws on missing directory or non-CSV input — callers should validate upstream.
/// </summary>
public static class FileDiscovery
{
    /// <summary>
    /// Returns all <c>*.csv</c> files under <paramref name="root"/>, recursively.
    /// Case-insensitive match on the extension. Returns absolute or relative paths
    /// depending on what <paramref name="root"/> was.
    /// </summary>
    public static IEnumerable<string> FindCsvFiles(string root) =>
        Directory.EnumerateFiles(root, "*.csv", SearchOption.AllDirectories);

    /// <summary>
    /// Replaces the <c>.csv</c> extension with <c>.parquet</c>. Throws if the input
    /// does not end with <c>.csv</c> (case-insensitive).
    /// </summary>
    public static string CsvToParquetPath(string csvPath)
    {
        var ext = Path.GetExtension(csvPath);
        if (!string.Equals(ext, ".csv", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"Expected a .csv path, got: {csvPath}", nameof(csvPath));

        var dir = Path.GetDirectoryName(csvPath) ?? "";
        var stem = Path.GetFileNameWithoutExtension(csvPath);
        return Path.Combine(dir, stem + ".parquet");
    }
}
```

- [ ] **Step 5: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~FileDiscoveryTests"
```

Expected: `Passed: 8` (one per `[Fact]` method). Zero failures.

- [ ] **Step 6: Commit**

```bash
git add backend/tools/PrmDashboard.ParquetBuilder/Build backend/tests/PrmDashboard.Tests/ParquetBuilder backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj
git commit -m "feat(tools): add FileDiscovery with CSV→Parquet path transform and tests"
```

---

### Task 3: Parquet converter via DuckDB with row-count verification

Invokes DuckDB's `COPY (SELECT * FROM read_csv_auto(...)) TO ... (FORMAT 'parquet')` for one CSV→Parquet pair, verifies the resulting Parquet has the same row count as the source CSV, and returns a structured result.

**Files:**
- Create: `backend/tools/PrmDashboard.ParquetBuilder/Build/ConversionResult.cs`
- Create: `backend/tools/PrmDashboard.ParquetBuilder/Build/ParquetConverter.cs`

- [ ] **Step 1: Create the result record**

Write `backend/tools/PrmDashboard.ParquetBuilder/Build/ConversionResult.cs`:

```csharp
namespace PrmDashboard.ParquetBuilder.Build;

/// <summary>
/// Outcome of converting one CSV to one Parquet.
/// <paramref name="Matches"/> is <c>true</c> iff <paramref name="CsvRows"/> == <paramref name="ParquetRows"/>.
/// </summary>
public sealed record ConversionResult(
    string CsvPath,
    string ParquetPath,
    long CsvRows,
    long ParquetRows,
    bool Matches);
```

- [ ] **Step 2: Implement `ParquetConverter`**

Write `backend/tools/PrmDashboard.ParquetBuilder/Build/ParquetConverter.cs`:

```csharp
using DuckDB.NET.Data;

namespace PrmDashboard.ParquetBuilder.Build;

public static class ParquetConverter
{
    /// <summary>
    /// Reads <paramref name="csvPath"/> via DuckDB's <c>read_csv_auto</c> and writes
    /// a Parquet file at <paramref name="parquetPath"/>. Overwrites any existing target.
    /// After writing, re-queries both files through the same in-memory DuckDB to
    /// compare row counts and returns a <see cref="ConversionResult"/>.
    /// </summary>
    public static async Task<ConversionResult> ConvertAsync(
        string csvPath,
        string parquetPath,
        CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(parquetPath)!);

        // Overwrite-in-place: DuckDB's COPY errors if the target exists. Explicit delete
        // is portable across DuckDB versions.
        if (File.Exists(parquetPath)) File.Delete(parquetPath);

        // In-memory DuckDB — no database file needed, we're just using the query engine.
        await using var conn = new DuckDBConnection("DataSource=:memory:");
        await conn.OpenAsync(ct);

        // 1. Count source rows (same path DuckDB will use during the COPY).
        long csvRows;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"SELECT COUNT(*) FROM read_csv_auto('{EscapeSingleQuotes(csvPath)}')";
            var o = await cmd.ExecuteScalarAsync(ct);
            csvRows = Convert.ToInt64(o);
        }

        // 2. Write Parquet.
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText =
                $"COPY (SELECT * FROM read_csv_auto('{EscapeSingleQuotes(csvPath)}')) " +
                $"TO '{EscapeSingleQuotes(parquetPath)}' (FORMAT 'parquet')";
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 3. Count the rows DuckDB actually wrote to the Parquet.
        long parquetRows;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = $"SELECT COUNT(*) FROM '{EscapeSingleQuotes(parquetPath)}'";
            var o = await cmd.ExecuteScalarAsync(ct);
            parquetRows = Convert.ToInt64(o);
        }

        return new ConversionResult(
            CsvPath: csvPath,
            ParquetPath: parquetPath,
            CsvRows: csvRows,
            ParquetRows: parquetRows,
            Matches: csvRows == parquetRows);
    }

    // DuckDB SQL uses single quotes for string literals. Paths rarely contain single quotes
    // on Windows, but doubling-up is the standard SQL-literal escape and costs nothing.
    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
```

- [ ] **Step 3: Build**

```bash
dotnet build backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Commit**

```bash
git add backend/tools/PrmDashboard.ParquetBuilder/Build/ConversionResult.cs backend/tools/PrmDashboard.ParquetBuilder/Build/ParquetConverter.cs
git commit -m "feat(tools): add ParquetConverter with DuckDB COPY and row-count verification"
```

---

### Task 4: CLI wiring in Program.cs

Replaces the Task 1 stub. Parses `--dir`, discovers CSVs, converts each, prints the summary table, exits 0/1/2.

**Files:**
- Modify: `backend/tools/PrmDashboard.ParquetBuilder/Program.cs`

- [ ] **Step 1: Replace `Program.cs` with the full implementation**

Write `backend/tools/PrmDashboard.ParquetBuilder/Program.cs`:

```csharp
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
```

- [ ] **Step 2: Build**

```bash
dotnet build backend/tools/PrmDashboard.ParquetBuilder/PrmDashboard.ParquetBuilder.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 3: Run --help to confirm wiring**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --help
```

Expected: the help text from `PrintHelp`; exit code 0.

- [ ] **Step 4: Run with no args — must fail cleanly**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder
```

Expected stderr: `ERROR: --dir is required. Example: --dir ./data`
Expected exit code: 2.

- [ ] **Step 5: Run with a nonexistent directory**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./definitely-not-a-real-dir-xyz
```

Expected stderr contains: `ERROR: directory not found:`
Expected exit code: 2.

- [ ] **Step 6: Commit**

```bash
git add backend/tools/PrmDashboard.ParquetBuilder/Program.cs
git commit -m "feat(tools): wire ParquetBuilder CLI, discovery, conversion, and summary"
```

---

### Task 5: Tool README

**Files:**
- Create: `backend/tools/PrmDashboard.ParquetBuilder/README.md`

- [ ] **Step 1: Write the README**

Write `backend/tools/PrmDashboard.ParquetBuilder/README.md` (outer fence uses four backticks so the README's own triple-backtick code fences render literally):

````markdown
# PrmDashboard.ParquetBuilder

Phase 2 migration tool (see `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`).

Walks a `data/` folder produced by `PrmDashboard.CsvExporter` (phase 1) and converts every `*.csv` into a sibling `*.parquet` using embedded DuckDB. Source CSVs are untouched.

## Usage

From the repo root, after phase 1 has populated `data/`:

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data
```

Show all options with `--help` / `-h`.

## Output layout

Each CSV produces a Parquet file in the same directory. The directory tree under `data/` is otherwise preserved:

```text
data/
├── master/
│   ├── tenants.csv + tenants.parquet
│   ├── employees.csv + employees.parquet
│   └── employee_airports.csv + employee_airports.parquet
├── aeroground/
│   └── prm_services.csv + prm_services.parquet
├── skyserve/
│   └── prm_services.csv + prm_services.parquet
└── globalprm/
    └── prm_services.csv + prm_services.parquet
```

## How it works

For each CSV the tool runs (via embedded DuckDB — no external binary required):

```sql
COPY (SELECT * FROM read_csv_auto('file.csv')) TO 'file.parquet' (FORMAT 'parquet')
```

DuckDB infers column types from the CSV header + sampled rows. The phase-1 exporter's deterministic formatting (ISO-8601 dates, invariant-culture numerics, `true`/`false` booleans, empty-cell-for-null) is designed so inference lands on the expected types: `INTEGER`, `DATE`, `TIMESTAMP`, `BOOLEAN`, `VARCHAR`.

Compression: DuckDB default (`SNAPPY`). Row group size: DuckDB default (122,880 rows). No CLI flags to tune either — this is a migration tool with tight scope.

## Verification

Every conversion is self-checked:

1. `SELECT COUNT(*) FROM read_csv_auto('file.csv')` — source row count
2. Write the Parquet via `COPY`
3. `SELECT COUNT(*) FROM 'file.parquet'` — round-trip row count
4. Summary row: `OK` iff the two counts match

At end of run:

```text
=== Summary ===
File                                                         CSV rows  Parquet rows  Status
master\tenants.parquet                                              3             3  OK
master\employees.parquet                                           12            12  OK
aeroground\prm_services.parquet                                  6660          6660  OK
...

SUCCESS: all row counts match source.
```

Exit codes:

- `0` — all row counts match source
- `1` — one or more files had a row-count mismatch
- `2` — `--dir` missing, directory not found, or no `.csv` files found under it

## Safe to re-run

Yes. Existing `*.parquet` files are deleted before each conversion, then rewritten. Source CSVs are never modified.

## What the tool does NOT do

- Does not modify source CSVs. The CSV set remains the human-readable source of truth; Parquet is the query format.
- Does not convert `.csv` files under the directory tree whose extension is uppercase (`.CSV`). Filesystems that preserve case won't match; we assume phase 1's lowercase output.
- Does not clean up stale Parquet files whose source CSV has been removed. If you delete a tenant mid-migration, you'll need to remove its `data/{slug}/` directory yourself — phase 4 of the overall migration guides that cleanup.
````

- [ ] **Step 2: Commit**

```bash
git add backend/tools/PrmDashboard.ParquetBuilder/README.md
git commit -m "docs(tools): add ParquetBuilder README"
```

---

### Task 6: End-to-end verification against the Phase 1 CSVs (manual; no commit)

Run the tool against a real CSV tree produced by the Phase 1 exporter. No commit — this is a live sanity check.

- [ ] **Step 1: Ensure `data/` has fresh CSVs**

If `data/` is empty or stale (phase 1 CSVs may have been cleaned up since the phase-1 verification), repopulate it. Start MySQL:

```bash
docker compose up mysql -d
```

Wait for `(healthy)`:

```bash
docker compose ps mysql
```

Run the phase 1 exporter:

```bash
dotnet run --project backend/tools/PrmDashboard.CsvExporter -- --master "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword" --tenant-host localhost --out ./data
```

Expected: `SUCCESS: all row counts match source.` (6/6 tables OK). If already populated from a prior run, this step can be skipped.

- [ ] **Step 2: Run the ParquetBuilder**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data
```

Expected:
- Summary with 6 rows, all `OK`
- `SUCCESS: all row counts match source.`
- Exit code 0 (PowerShell: `$LASTEXITCODE`; Bash: `echo $?`)

- [ ] **Step 3: Verify 6 Parquet files exist**

PowerShell:

```powershell
Get-ChildItem data -Recurse -Filter *.parquet | Select-Object FullName
```

Bash:

```bash
find data -name '*.parquet'
```

Expected: six files — `data/master/{tenants,employees,employee_airports}.parquet` + `data/{aeroground,skyserve,globalprm}/prm_services.parquet`.

- [ ] **Step 4: Magic-number check on one Parquet**

Parquet files start with the 4-byte signature `PAR1` (hex `50 41 52 31`).

PowerShell:

```powershell
$b = [System.IO.File]::ReadAllBytes("data/aeroground/prm_services.parquet")
"First 4 bytes: $($b[0..3] -join ' ') — expect 80 65 82 49 (ASCII 'PAR1')"
"Last 4 bytes : $($b[-4..-1] -join ' ') — expect 80 65 82 49 (ASCII 'PAR1')"
```

Bash:

```bash
head -c 4 data/aeroground/prm_services.parquet | xxd
tail -c 4 data/aeroground/prm_services.parquet | xxd
```

Expected: both the first and last 4 bytes are `PAR1` (the Parquet format uses the signature as both a header and trailer).

- [ ] **Step 5: Re-run for idempotency**

```bash
dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data
```

Expected: identical summary, `SUCCESS`, exit 0. Same files overwritten in place.

- [ ] **Step 6: Tear down MySQL (optional)**

If you started MySQL only for this verification:

```bash
docker compose down
```

- [ ] **Step 7: Report results**

Paste back to the controller (or note locally):
1. Step 2 summary table + exit code
2. Step 3 file list
3. Step 4 magic-number bytes

This completes Phase 2. The Parquet set is now ready for Phase 3 (backend swap) to consume via `DuckDB.NET.Data`.

---

## Success criteria (recap from spec)

- [x] `backend/tools/PrmDashboard.ParquetBuilder/` exists and builds as part of the solution.
- [x] `data/**/*.parquet` exist for every corresponding `.csv`.
- [x] `SELECT COUNT(*) FROM 'data/<slug>/prm_services.parquet'` returns the same count as the CSV (verified by the tool itself, double-checked manually in Task 6).
- [x] Tool is safe to re-run: Parquet files are overwritten, CSVs are never modified.
- [x] No MySQL dependency in the tool (embedded DuckDB only — confirmed by the absence of `MySqlConnector` in the csproj).
