# Phase 1 — MySQL → CSV Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-shot .NET 8 console tool that dumps the full MySQL contents (master tables + per-tenant `prm_services`) into deterministic RFC 4180 CSV files under `data/`, verifying row counts. MySQL is read-only from the tool's perspective; the running stack is untouched.

**Architecture:** Single console project `backend/tools/PrmDashboard.CsvExporter/` added to the existing solution under a new `tools/` solution folder. Raw SQL via `MySqlConnector` only (no EF, no `PrmDashboard.Shared` reference — the tool is deliberately self-contained so phase 3's column drops don't cascade). A pure `CsvFormatter` handles all RFC 4180 / null / date / HHMM formatting and has unit tests. A `TableExporter` streams `SELECT ...` results directly to a CSV `TextWriter`, computing `COUNT(*)` from the same SQL for verification. The exporter exits non-zero on any row-count mismatch.

**Tech Stack:**
- .NET 8 console app (`Microsoft.NET.Sdk`, `<OutputType>Exe</OutputType>`, top-level statements)
- `MySqlConnector` 2.3.7 (same version pinned elsewhere in the solution — do not upgrade)
- `Microsoft.Extensions.Configuration.Json` 8.0.1 (to read `appsettings.json`)
- xUnit 2.9.3 + existing `PrmDashboard.Tests` project for unit tests on `CsvFormatter`
- No new transitive dependencies beyond the above

---

## Spec resolutions baked into this plan

These were open items in the spec; they are now locked for phase 1:

1. **`data/` is gitignored.** Added as `/data/` to root `.gitignore`. Rationale: fully regenerable from the tool; avoids committing tenant data (even synthetic); keeps the repo small.
2. **CSV column lists include the vestigial `db_host/db_port/db_name/db_user/db_password` fields on the tenants dump.** Phase 1 is a full-fidelity dump; column pruning happens in phase 3 when the runtime code stops consuming them.
3. **Verification is built into the tool, not a separate script.** The exporter re-queries `SELECT COUNT(*) FROM ({userSql}) AS sub` against the source, compares to rows written, and exits non-zero on mismatch.
4. **CSV formatter is hand-rolled (~30 LOC).** No CsvHelper dependency — the spec's formatting contract (UTF-8 no BOM, LF, RFC 4180 quoting, null → empty, HHMM stays int, `DateOnly` as `yyyy-MM-dd`, `DateTime` as ISO-8601 Z, bool as `true`/`false`) is narrow enough to own directly.
5. **Integration tests against a live MySQL are out of scope** for phase 1. Unit tests cover `CsvFormatter`; end-to-end verification is a documented manual step (Task 9) against `docker compose up mysql`. A Testcontainers-based integration test can be added later if the tool is kept long-term.

---

## Files to create/modify

Create:
- `backend/tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj`
- `backend/tools/PrmDashboard.CsvExporter/Program.cs`
- `backend/tools/PrmDashboard.CsvExporter/appsettings.json`
- `backend/tools/PrmDashboard.CsvExporter/Csv/CsvFormatter.cs`
- `backend/tools/PrmDashboard.CsvExporter/Export/TableExporter.cs`
- `backend/tools/PrmDashboard.CsvExporter/Export/TableExportResult.cs`
- `backend/tools/PrmDashboard.CsvExporter/Export/MasterExporter.cs`
- `backend/tools/PrmDashboard.CsvExporter/Export/TenantDbExporter.cs`
- `backend/tools/PrmDashboard.CsvExporter/README.md`
- `backend/tests/PrmDashboard.Tests/CsvExporter/CsvFormatterTests.cs`

Modify:
- `backend/PrmDashboard.sln` — register new projects + `tools` solution folder (`dotnet sln add` handles this)
- `backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj` — add `ProjectReference` to `PrmDashboard.CsvExporter`
- `.gitignore` — add `/data/` line

---

### Task 1: Scaffold the console project and register it in the solution

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj`
- Create: `backend/tools/PrmDashboard.CsvExporter/Program.cs`
- Create: `backend/tools/PrmDashboard.CsvExporter/appsettings.json`
- Modify: `backend/PrmDashboard.sln`

- [ ] **Step 1: Create the csproj**

Write `backend/tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>PrmDashboard.CsvExporter</RootNamespace>
    <AssemblyName>PrmDashboard.CsvExporter</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Configuration" Version="8.0.0" />
    <PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="8.0.1" />
    <PackageReference Include="Microsoft.Extensions.Configuration.EnvironmentVariables" Version="8.0.0" />
    <PackageReference Include="MySqlConnector" Version="2.3.7" />
  </ItemGroup>

  <ItemGroup>
    <None Update="appsettings.json">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    </None>
  </ItemGroup>

  <ItemGroup>
    <InternalsVisibleTo Include="PrmDashboard.Tests" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Create a stub Program.cs**

Write `backend/tools/PrmDashboard.CsvExporter/Program.cs`:

```csharp
Console.WriteLine("PrmDashboard.CsvExporter: stub. Full CLI wired in Task 6.");
return 0;
```

- [ ] **Step 3: Create appsettings.json**

Write `backend/tools/PrmDashboard.CsvExporter/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "MasterDb": ""
  }
}
```

- [ ] **Step 4: Add project to the solution under a `tools` folder**

Run from the repo root:

```bash
cd backend
dotnet sln PrmDashboard.sln add --solution-folder tools tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Project 'tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj' added to the solution.`

- [ ] **Step 5: Build the full solution — must succeed**

Run from the repo root:

```bash
cd backend
dotnet build
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)` (the existing four services plus the new tool all compile).

- [ ] **Step 6: Run the stub exe**

```bash
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter
```

Expected stdout: `PrmDashboard.CsvExporter: stub. Full CLI wired in Task 6.`
Expected exit code: 0.

- [ ] **Step 7: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter backend/PrmDashboard.sln
git commit -m "chore(tools): scaffold PrmDashboard.CsvExporter console project"
```

---

### Task 2: Build the RFC 4180 CSV formatter with unit tests

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/Csv/CsvFormatter.cs`
- Create: `backend/tests/PrmDashboard.Tests/CsvExporter/CsvFormatterTests.cs`
- Modify: `backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj` (add project reference)

- [ ] **Step 1: Add project reference from tests to CsvExporter**

Run from the repo root:

```bash
cd backend
dotnet add tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj reference tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Reference 'tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj' added to the project.`

- [ ] **Step 2: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/CsvExporter/CsvFormatterTests.cs`:

```csharp
using System.Globalization;
using System.IO;
using PrmDashboard.CsvExporter.Csv;
using Xunit;

namespace PrmDashboard.Tests.CsvExporter;

public class CsvFormatterTests
{
    [Fact]
    public void FormatField_Null_ReturnsEmptyString()
    {
        Assert.Equal("", CsvFormatter.FormatField(null));
        Assert.Equal("", CsvFormatter.FormatField(DBNull.Value));
    }

    [Fact]
    public void FormatField_PlainString_ReturnsUnquoted()
    {
        Assert.Equal("hello", CsvFormatter.FormatField("hello"));
    }

    [Fact]
    public void FormatField_StringWithComma_IsQuoted()
    {
        Assert.Equal("\"hello, world\"", CsvFormatter.FormatField("hello, world"));
    }

    [Fact]
    public void FormatField_StringWithQuote_IsQuotedAndQuoteDoubled()
    {
        Assert.Equal("\"she said \"\"hi\"\"\"", CsvFormatter.FormatField("she said \"hi\""));
    }

    [Fact]
    public void FormatField_StringWithNewline_IsQuoted()
    {
        Assert.Equal("\"line1\nline2\"", CsvFormatter.FormatField("line1\nline2"));
    }

    [Fact]
    public void FormatField_StringWithCarriageReturn_IsQuoted()
    {
        Assert.Equal("\"line1\rline2\"", CsvFormatter.FormatField("line1\rline2"));
    }

    [Fact]
    public void FormatField_Integer_ReturnsBareNumber()
    {
        Assert.Equal("800", CsvFormatter.FormatField(800));      // HHMM value stays as int
        Assert.Equal("-1", CsvFormatter.FormatField(-1));
        Assert.Equal("0", CsvFormatter.FormatField(0));
    }

    [Fact]
    public void FormatField_Long_ReturnsBareNumber()
    {
        Assert.Equal("9999999999", CsvFormatter.FormatField(9999999999L));
    }

    [Fact]
    public void FormatField_BoolTrue_LowercaseTrue()
    {
        Assert.Equal("true", CsvFormatter.FormatField(true));
    }

    [Fact]
    public void FormatField_BoolFalse_LowercaseFalse()
    {
        Assert.Equal("false", CsvFormatter.FormatField(false));
    }

    [Fact]
    public void FormatField_DateOnly_IsIsoDate()
    {
        Assert.Equal("2026-04-21", CsvFormatter.FormatField(new DateOnly(2026, 4, 21)));
    }

    [Fact]
    public void FormatField_DateTime_IsIsoUtc()
    {
        // Explicitly UTC
        var dt = new DateTime(2026, 4, 21, 7, 30, 5, DateTimeKind.Utc);
        Assert.Equal("2026-04-21T07:30:05Z", CsvFormatter.FormatField(dt));
    }

    [Fact]
    public void FormatField_DateTime_UnspecifiedTreatedAsUtc()
    {
        // MySqlConnector returns Unspecified kind for DATETIME columns; we must treat as UTC.
        var dt = new DateTime(2026, 4, 21, 7, 30, 5, DateTimeKind.Unspecified);
        Assert.Equal("2026-04-21T07:30:05Z", CsvFormatter.FormatField(dt));
    }

    [Fact]
    public void FormatField_Decimal_UsesInvariantCulture()
    {
        var prev = Thread.CurrentThread.CurrentCulture;
        try
        {
            Thread.CurrentThread.CurrentCulture = new CultureInfo("de-DE"); // comma decimal
            Assert.Equal("1234.56", CsvFormatter.FormatField(1234.56m));
        }
        finally { Thread.CurrentThread.CurrentCulture = prev; }
    }

    [Fact]
    public void FormatField_Double_UsesInvariantCulture()
    {
        Assert.Equal("3.14", CsvFormatter.FormatField(3.14));
    }

    [Fact]
    public void WriteRow_EmitsFieldsWithCommasAndLfOnly()
    {
        using var sw = new StringWriter { NewLine = "\n" };
        CsvFormatter.WriteRow(sw, new object?[] { "a", 1, null, "b,c" });
        Assert.Equal("a,1,,\"b,c\"\n", sw.ToString());
    }

    [Fact]
    public void WriteRow_EmptyEnumerable_EmitsOnlyNewline()
    {
        using var sw = new StringWriter { NewLine = "\n" };
        CsvFormatter.WriteRow(sw, Array.Empty<object?>());
        Assert.Equal("\n", sw.ToString());
    }
}
```

- [ ] **Step 3: Run tests — they must fail because `CsvFormatter` doesn't exist yet**

Run:

```bash
cd backend
dotnet test tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~CsvFormatterTests"
```

Expected: compilation error `CS0234: The type or namespace name 'CsvExporter' does not exist in the namespace 'PrmDashboard'` (or similar). This confirms the test harness sees the missing type.

- [ ] **Step 4: Implement CsvFormatter**

Write `backend/tools/PrmDashboard.CsvExporter/Csv/CsvFormatter.cs`:

```csharp
using System.Globalization;
using System.IO;

namespace PrmDashboard.CsvExporter.Csv;

/// <summary>
/// Deterministic RFC 4180 CSV field/row formatting per phase 1 spec:
/// UTF-8 (no BOM decided at writer level), LF line endings, null -> empty,
/// bool -> "true"/"false", DateOnly -> "yyyy-MM-dd", DateTime -> ISO-8601 UTC,
/// numeric types emitted via invariant culture.
/// </summary>
public static class CsvFormatter
{
    public static string FormatField(object? value)
    {
        if (value is null || value is DBNull) return "";

        string s = value switch
        {
            bool b        => b ? "true" : "false",
            DateOnly d    => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateTime dt   => DateTime.SpecifyKind(dt, DateTimeKind.Utc)
                                .ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
            IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
            _             => value.ToString() ?? ""
        };

        return NeedsQuoting(s) ? Quote(s) : s;
    }

    /// <summary>
    /// Writes one CSV row terminated by LF. Callers must configure <paramref name="writer"/>
    /// with <c>NewLine = "\n"</c> and a UTF-8-no-BOM encoding.
    /// </summary>
    public static void WriteRow(TextWriter writer, IEnumerable<object?> fields)
    {
        bool first = true;
        foreach (var f in fields)
        {
            if (!first) writer.Write(',');
            writer.Write(FormatField(f));
            first = false;
        }
        writer.Write('\n');
    }

    private static bool NeedsQuoting(string s)
    {
        foreach (var c in s)
        {
            if (c == ',' || c == '"' || c == '\n' || c == '\r') return true;
        }
        return false;
    }

    private static string Quote(string s) => "\"" + s.Replace("\"", "\"\"") + "\"";
}
```

- [ ] **Step 5: Run tests — they must pass**

```bash
cd backend
dotnet test tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~CsvFormatterTests"
```

Expected: `Passed: 17` (equal to the number of `[Fact]` methods above). Zero failures.

- [ ] **Step 6: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/Csv backend/tests/PrmDashboard.Tests/CsvExporter backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj
git commit -m "feat(tools): add RFC 4180 CsvFormatter with unit tests"
```

---

### Task 3: Build the streaming `TableExporter`

Reads from MySQL via a caller-supplied `SELECT ...` string, writes a UTF-8-no-BOM / LF-only CSV at the target path, and verifies row count by re-querying `COUNT(*)` on the same SQL.

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/Export/TableExportResult.cs`
- Create: `backend/tools/PrmDashboard.CsvExporter/Export/TableExporter.cs`

- [ ] **Step 1: Create the result record**

Write `backend/tools/PrmDashboard.CsvExporter/Export/TableExportResult.cs`:

```csharp
namespace PrmDashboard.CsvExporter.Export;

/// <summary>
/// Outcome of exporting one SELECT to one CSV file.
/// <paramref name="Matches"/> is <c>true</c> iff <paramref name="RowsWritten"/> == <paramref name="SourceCount"/>.
/// </summary>
public sealed record TableExportResult(
    string Label,
    string OutputPath,
    int RowsWritten,
    int SourceCount,
    bool Matches);
```

- [ ] **Step 2: Implement `TableExporter`**

Write `backend/tools/PrmDashboard.CsvExporter/Export/TableExporter.cs`:

```csharp
using System.Text;
using MySqlConnector;
using PrmDashboard.CsvExporter.Csv;

namespace PrmDashboard.CsvExporter.Export;

public static class TableExporter
{
    private static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);

    /// <summary>
    /// Streams <paramref name="selectSql"/> from MySQL to a CSV at <paramref name="outputPath"/>.
    /// Creates parent directories. Overwrites existing file. Returns row-count verification result.
    /// </summary>
    public static async Task<TableExportResult> ExportAsync(
        string connectionString,
        string label,
        string selectSql,
        string outputPath,
        CancellationToken ct = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

        await using var conn = new MySqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // 1. Source row count — wrap user SQL so the same filters apply.
        int sourceCount;
        await using (var countCmd = conn.CreateCommand())
        {
            countCmd.CommandText = $"SELECT COUNT(*) FROM ({selectSql}) AS sub";
            var o = await countCmd.ExecuteScalarAsync(ct);
            sourceCount = Convert.ToInt32(o);
        }

        // 2. Stream SELECT into CSV
        int rowsWritten = 0;
        await using (var selectCmd = conn.CreateCommand())
        {
            selectCmd.CommandText = selectSql;
            await using var reader = await selectCmd.ExecuteReaderAsync(ct);

            await using var stream = new FileStream(outputPath, FileMode.Create, FileAccess.Write, FileShare.Read);
            await using var writer = new StreamWriter(stream, Utf8NoBom) { NewLine = "\n" };

            // Header row
            var header = new object?[reader.FieldCount];
            for (int i = 0; i < reader.FieldCount; i++) header[i] = reader.GetName(i);
            CsvFormatter.WriteRow(writer, header);

            // Data rows
            var buf = new object?[reader.FieldCount];
            while (await reader.ReadAsync(ct))
            {
                for (int i = 0; i < reader.FieldCount; i++)
                    buf[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);

                CsvFormatter.WriteRow(writer, buf);
                rowsWritten++;
            }
        }

        return new TableExportResult(
            Label: label,
            OutputPath: outputPath,
            RowsWritten: rowsWritten,
            SourceCount: sourceCount,
            Matches: rowsWritten == sourceCount);
    }
}
```

- [ ] **Step 3: Build to confirm it compiles**

```bash
cd backend
dotnet build tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/Export
git commit -m "feat(tools): add streaming TableExporter with COUNT(*) verification"
```

---

### Task 4: Master-database exporter

Dumps `tenants`, `employees`, `employee_airports` from `prm_master` into `{out}/master/*.csv` with explicit column lists (pins order; avoids pulling MySQL-internal housekeeping columns).

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/Export/MasterExporter.cs`

- [ ] **Step 1: Implement MasterExporter**

Write `backend/tools/PrmDashboard.CsvExporter/Export/MasterExporter.cs`:

```csharp
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
```

- [ ] **Step 2: Build**

```bash
cd backend
dotnet build tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 3: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/Export/MasterExporter.cs
git commit -m "feat(tools): add MasterExporter for tenants, employees, employee_airports"
```

---

### Task 5: Tenant-database exporter

Reads active tenants from the master DB, builds per-tenant connection strings, and dumps each `prm_services` table into `{out}/{slug}/prm_services.csv`.

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/Export/TenantDbExporter.cs`

- [ ] **Step 1: Implement TenantDbExporter**

Write `backend/tools/PrmDashboard.CsvExporter/Export/TenantDbExporter.cs`:

```csharp
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
        CancellationToken ct = default)
    {
        var tenants = await LoadActiveTenantsAsync(masterConnectionString, ct);

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
            list.Add(new ActiveTenant(slug, $"Server={host};Port={port};Database={db};User={user};Password={pwd}"));
        }
        return list;
    }
}
```

- [ ] **Step 2: Build**

```bash
cd backend
dotnet build tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 3: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/Export/TenantDbExporter.cs
git commit -m "feat(tools): add TenantDbExporter for per-tenant prm_services dump"
```

---

### Task 6: Wire CLI parsing, configuration, and verification into `Program.cs`

Replaces the stub with the real entrypoint. Resolves master connection string from (in order): `--master` CLI arg, `MASTER_CONNECTION_STRING` env var, `appsettings.json:ConnectionStrings:MasterDb`. Prints a summary table and exits non-zero on any row-count mismatch.

**Files:**
- Modify: `backend/tools/PrmDashboard.CsvExporter/Program.cs`

- [ ] **Step 1: Replace `Program.cs` with the full implementation**

Write `backend/tools/PrmDashboard.CsvExporter/Program.cs` (overwrites the Task 1 stub):

```csharp
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
    allResults.AddRange(await TenantDbExporter.ExportAllAsync(masterConn, outDir));

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
    Console.WriteLine("  --out <dir>      Output directory (default: ./data)");
    Console.WriteLine("  --master <str>   Master DB connection string (overrides env + appsettings.json)");
    Console.WriteLine("  -h, --help       Show this help");
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
```

- [ ] **Step 2: Build**

```bash
cd backend
dotnet build tools/PrmDashboard.CsvExporter/PrmDashboard.CsvExporter.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 3: Run --help to confirm wiring**

```bash
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter -- --help
```

Expected: the help text printed; exit code 0.

- [ ] **Step 4: Run with no config — must fail with a clean error**

```bash
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter
```

Expected stderr: `ERROR: master connection string not provided. ...`
Expected exit code: 2.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/Program.cs
git commit -m "feat(tools): wire CLI args, config resolution, and summary output"
```

---

### Task 7: Gitignore the `data/` output directory

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append the rule**

Edit `.gitignore` — append these two lines at the end (after any existing final newline):

```gitignore
# CSV/Parquet exports (regenerated by backend/tools/PrmDashboard.CsvExporter)
/data/
```

- [ ] **Step 2: Verify it's ignored**

Run (creates then removes a tracking probe):

```bash
mkdir -p data/master && touch data/master/_probe.csv
git status --short data/
```

Expected: no output (the probe is ignored).

```bash
rm -rf data/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore /data/ (CSV/Parquet export output)"
```

---

### Task 8: Write the tool README

**Files:**
- Create: `backend/tools/PrmDashboard.CsvExporter/README.md`

- [ ] **Step 1: Write the README**

Write `backend/tools/PrmDashboard.CsvExporter/README.md` (outer fence uses four backticks so the README's own triple-backtick code fences render literally):

````markdown
# PrmDashboard.CsvExporter

Phase 1 migration tool (see `docs/superpowers/specs/2026-04-20-mysql-to-duckdb-migration-design.md`).

Dumps the entire MySQL contents — master tables plus each active tenant's `prm_services` — into a `data/` folder of deterministic RFC 4180 CSV files. MySQL is read-only from the tool's perspective; this is safe to run against production data.

## Usage

Start MySQL (or point at an existing instance), then:

```bash
# From repo root
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter -- --out ../data
```

Resolution order for the master connection string:

1. `--master "Server=...;Port=...;Database=prm_master;User=...;Password=..."`
2. `MASTER_CONNECTION_STRING` env var
3. `appsettings.json` — `ConnectionStrings:MasterDb`

## Output layout

```text
data/
├── master/
│   ├── tenants.csv
│   ├── employees.csv
│   └── employee_airports.csv
├── aeroground/
│   └── prm_services.csv
├── skyserve/
│   └── prm_services.csv
└── globalprm/
    └── prm_services.csv
```

## CSV format guarantees

- UTF-8 encoding, **no BOM**
- Unix line endings (**LF**, not CRLF)
- RFC 4180 quoting: fields containing `,`, `"`, `\n`, or `\r` are quoted; embedded quotes are doubled
- `NULL` → empty cell (not the literal word `null`)
- Booleans → `true` / `false` (lowercase)
- `DateOnly` → `yyyy-MM-dd`
- `DateTime` → `yyyy-MM-ddTHH:mm:ssZ` (UTC, ISO-8601)
- HHMM integer columns (`start_time`, `paused_at`, `end_time`) stay as integers — no zero-padding
- Numeric types formatted with invariant culture (`.` as decimal separator, no thousands separators)

## Verification

The tool re-queries `SELECT COUNT(*) FROM ({selectSql}) AS sub` for every table it dumps and prints a summary:

```text
Table                          Rows   Source  Status    Path
master.tenants                    3        3  OK        /abs/data/master/tenants.csv
master.employees                 12       12  OK        /abs/data/master/employees.csv
...
aeroground.prm_services        4821     4821  OK        /abs/data/aeroground/prm_services.csv
```

Exits non-zero if any row-count mismatches; success on all-OK.

## What is **not** exported

Per the phase 1 spec (lines 40–49 of the design doc):

- `refresh_tokens` — obsolete; AuthService moves to in-memory store in phase 3
- `schema_migrations` tracker rows — no migration framework in the new model

## Safe to re-run

Yes. All CSVs are overwritten in place. The tool opens MySQL read-only (no writes).
````

- [ ] **Step 2: Commit**

```bash
git add backend/tools/PrmDashboard.CsvExporter/README.md
git commit -m "docs(tools): add CsvExporter README"
```

---

### Task 9: End-to-end verification against local MySQL (manual; no commit)

This task has no commit — it's a manual sanity-check that the tool produces the right files when run against real MySQL. Do not skip: all prior tasks built individual pieces; this exercises the whole pipeline.

- [ ] **Step 1: Start MySQL via docker compose**

```bash
cd /c/Users/prera/dev-ai/angular_powerbi
cp .env.example .env   # if not already done — gives MYSQL_ROOT_PASSWORD=rootpassword
docker compose up mysql -d
```

Wait for the container to be healthy:

```bash
docker compose ps mysql
```

Expected: `STATUS` column reads `Up ... (healthy)`. If it reads `(health: starting)`, wait ~30 seconds and re-check.

- [ ] **Step 2: Confirm seed data is present**

```bash
docker compose exec mysql mysql -uroot -prootpassword -e "SELECT slug FROM prm_master.tenants; SELECT COUNT(*) FROM aeroground_db.prm_services; SELECT COUNT(*) FROM skyserve_db.prm_services; SELECT COUNT(*) FROM globalprm_db.prm_services;"
```

Expected: 3 slug rows (`aeroground`, `skyserve`, `globalprm`) and a non-zero `COUNT(*)` for each tenant DB.

Note the three counts — you'll diff them against the tool's output.

- [ ] **Step 3: Run the exporter**

```bash
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter -- \
    --master "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword" \
    --out ../data
```

Expected:
- Summary table prints with `OK` in the Status column for every row.
- Final line: `SUCCESS: all row counts match source.`
- Exit code 0.

- [ ] **Step 4: Verify the directory tree**

```bash
ls data/ data/master/ data/aeroground/ data/skyserve/ data/globalprm/
```

Expected directories and files exactly as in the README's "Output layout" section (no extras, no missing).

- [ ] **Step 5: Verify row counts independently of the tool**

For each tenant, CSV data rows (total lines minus 1 header) should equal the `SELECT COUNT(*)` from Step 2:

```bash
wc -l data/aeroground/prm_services.csv
wc -l data/skyserve/prm_services.csv
wc -l data/globalprm/prm_services.csv
wc -l data/master/tenants.csv data/master/employees.csv data/master/employee_airports.csv
```

Expected: `(wc -l output) - 1 == (SELECT COUNT(*) from Step 2)` for each file. Master tables should be 3 tenants, 12 employees, and ~20–40 employee-airport assignments depending on seed.

- [ ] **Step 6: Spot-check CSV formatting**

```bash
head -3 data/aeroground/prm_services.csv
file data/aeroground/prm_services.csv
```

Expected:
- First line is a header with 25 comma-separated column names starting `row_id,id,flight,flight_number,...`.
- `file` output includes `UTF-8 Unicode text` with no mention of BOM and no mention of CRLF. (On Windows/Git Bash the phrasing may vary — key checks are "UTF-8" and no "with BOM" / "CRLF".)

- [ ] **Step 7: Re-run — confirm it's idempotent**

```bash
cd backend
dotnet run --project tools/PrmDashboard.CsvExporter -- \
    --master "Server=localhost;Port=3306;Database=prm_master;User=root;Password=rootpassword" \
    --out ../data
```

Expected: identical summary, exit code 0, file contents unchanged (`git status data/` confirms nothing — remember `data/` is gitignored, but `diff` against a prior copy would also show no change).

- [ ] **Step 8: Tear down**

```bash
cd /c/Users/prera/dev-ai/angular_powerbi
docker compose down
```

Phase 1 complete. No code changes at this step; report results to the user so they can approve moving on to phase 2.

---

## Success criteria (recap from spec)

- [x] `backend/tools/PrmDashboard.CsvExporter/` exists and builds as part of the solution.
- [x] `data/master/tenants.csv`, `data/master/employees.csv`, `data/master/employee_airports.csv` exist.
- [x] `data/{slug}/prm_services.csv` exists for every active tenant (`aeroground`, `skyserve`, `globalprm`).
- [x] Row counts in every CSV match `SELECT COUNT(*)` of the source table — enforced by the tool's non-zero exit code on mismatch.
- [x] MySQL untouched: tool opens connections read-only; no `INSERT`/`UPDATE`/`DELETE` SQL anywhere in the code.
- [x] `/data/` is gitignored so accidental commits of tenant data can't happen.
- [x] `refresh_tokens` and `schema_migrations` explicitly not exported (not in any `SELECT` in the tool).
