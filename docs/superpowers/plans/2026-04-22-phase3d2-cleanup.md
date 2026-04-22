# Phase 3d-2 — Final EF/MySQL Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete all remaining EF/MySQL residue from the backend runtime — the now-deadcode `/resolve/{slug}` TenantService endpoint, its DTO, vestigial `Shared/Models/*` classes, EF navigation properties, and the last two EF-related packages on `PrmDashboard.Shared.csproj`. Apply three forward concerns from the Phase 3d-1 final review. After this phase, the backend runtime is EF/MySQL-free in source; only the one-shot `tools/PrmDashboard.CsvExporter` tool keeps MySqlConnector for legacy-data export.

**Architecture:** Three atomic commits. (1) Remove `/resolve` endpoint + handler + DTO + service method from TenantService, plus the five deprecated Shared models and EF navs. (2) Drop the two EF packages from `Shared.csproj`. (3) Apply the three 3d-1 forward-review fixes to TrendService and RecordService.

**Tech Stack:**
- .NET 8 backend (four service projects + Shared lib + tests)
- DuckDB.NET, BCrypt, JWT, Serilog — all already in place
- No new dependencies; only removals

---

## Spec resolutions baked into this plan

The Phase 3d-2 spec (`docs/superpowers/specs/2026-04-22-phase3d2-cleanup-design.md`) lists five open items. This plan locks them:

1. **Removing EF packages from Shared.csproj breaks nothing.** Self-verifying: build will fail if any `using Microsoft.EntityFrameworkCore;` survives. Grep across the post-3d-1 codebase confirms none do.
2. **Keep all scalar fields on `Employee` and `EmployeeAirport`.** Only navs are stripped. Classes stay as plain-object shapes (not records) so AuthService's setter-based construction keeps working.
3. **Leave `db_*` columns in `master/tenants.parquet`.** Parquet columns unread by queries are ignored by DuckDB; removing them requires regenerating every tenant parquet, out of scope.
4. **OpenAPI regenerates automatically.** No manual doc sync needed.
5. **Shared/Models folder is retained** with three remaining files: `Employee.cs`, `EmployeeAirport.cs`, `TenantInfo.cs`.

---

## Files to create/modify/delete

Create: **none**.

Modify:

- `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj`
- `backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs`
- `backend/src/PrmDashboard.Shared/Models/Employee.cs`
- `backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs`
- `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs`
- `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`
- `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`
- `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`

Delete:

- `backend/src/PrmDashboard.Shared/Models/Tenant.cs`
- `backend/src/PrmDashboard.Shared/Models/RefreshToken.cs`
- `backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs`

No test changes, no `Program.cs` changes (in any service), no `appsettings*.json` changes, no docker-compose / gateway / frontend changes.

---

## Pre-task: branch state

All Phase-3d-2 work lands on `phase3d2-cleanup` branch. Expected latest commit on main when this plan runs: `b5ab73f fix(prm): restore indentation on Swashbuckle PackageReference in csproj` (tail of Phase 3d-1 merge).

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi log --oneline -3
```

Baseline tests: run once before starting to confirm 134/134 passing.

```bash
dotnet test /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 134, Failed: 0`.

---

## Task 1: Delete `/resolve` endpoint, vestigial Shared models, EF navs

One atomic deletion pass. Build + tests must stay green.

**Files:**
- Delete: `backend/src/PrmDashboard.Shared/Models/Tenant.cs`
- Delete: `backend/src/PrmDashboard.Shared/Models/RefreshToken.cs`
- Delete: `backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs`
- Modify: `backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs`
- Modify: `backend/src/PrmDashboard.Shared/Models/Employee.cs`
- Modify: `backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs`
- Modify: `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs`
- Modify: `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`

- [ ] **Step 1: Delete the three Shared model files**

```bash
rm /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared/Models/Tenant.cs
rm /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared/Models/RefreshToken.cs
rm /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared/Models/PrmServiceRecord.cs
```

- [ ] **Step 2: Strip EF navs from `Employee.cs`**

Replace the full contents of `backend/src/PrmDashboard.Shared/Models/Employee.cs` with:

```csharp
namespace PrmDashboard.Shared.Models;

public class Employee
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLogin { get; set; }

    public ICollection<EmployeeAirport> Airports { get; set; } = new List<EmployeeAirport>();
}
```

(The `public Tenant Tenant` and `public ICollection<RefreshToken> RefreshTokens` navigation lines are removed. Scalar fields and `Airports` are preserved.)

- [ ] **Step 3: Strip back-ref nav from `EmployeeAirport.cs`**

Replace the full contents of `backend/src/PrmDashboard.Shared/Models/EmployeeAirport.cs` with:

```csharp
namespace PrmDashboard.Shared.Models;

public class EmployeeAirport
{
    public int Id { get; set; }
    public int EmployeeId { get; set; }
    public string AirportCode { get; set; } = string.Empty;
    public string AirportName { get; set; } = string.Empty;
}
```

(The `public Employee Employee { get; set; } = null!;` back-ref is removed.)

- [ ] **Step 4: Remove `TenantResolveResponse` DTO from `TenantDtos.cs`**

Open `backend/src/PrmDashboard.Shared/DTOs/TenantDtos.cs`. Delete the `TenantResolveResponse` record (6 positional fields: `TenantId`, `DbHost`, `DbPort`, `DbName`, `DbUser`, `DbPassword`). Keep `TenantConfigResponse` and `AirportDto` records. Final file should have only those two records plus the namespace declaration.

- [ ] **Step 5: Remove `Resolve` action from `TenantController.cs`**

Open `backend/src/PrmDashboard.TenantService/Controllers/TenantController.cs`. Delete the entire `Resolve` action method including its `<summary>` doc comment + `[Authorize]` + `[HttpGet("resolve/{slug}")]` attributes. Keep the constructor, the `GetConfig` action, and the `GetAirports` action intact.

The final class should have:
- Constructor taking `TenantResolutionService`
- `GetConfig([FromQuery] string slug, ...)` — `[HttpGet("config")]`, public
- `GetAirports(...)` — `[Authorize]`, `[HttpGet("airports")]`

- [ ] **Step 6: Remove `ResolveAsync` + `LegacyTenantResolveData` from `TenantResolutionService.cs`**

Open `backend/src/PrmDashboard.TenantService/Services/TenantResolutionService.cs`. Delete:
- The top-of-file `internal sealed record LegacyTenantResolveData(...)` declaration
- The `public async Task<LegacyTenantResolveData?> ResolveAsync(...)` method (including its `<summary>` doc comment)
- Any `using` statements that become unused after the deletion (e.g., if `TenantResolveResponse` was imported via `using PrmDashboard.Shared.DTOs;` — keep the using if other DTOs from that namespace are still used, remove otherwise)

Keep:
- Class declaration + DI ctor
- `GetConfigAsync(string slug, CancellationToken ct)` method
- `GetAirportsForEmployeeAsync(int employeeId, CancellationToken ct)` method
- The `_duck`, `_paths`, `_loader`, `_logger` fields

- [ ] **Step 7: Build**

```bash
dotnet build /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings. If errors appear, they indicate residual references to deleted types — investigate and fix before proceeding.

- [ ] **Step 8: Grep for dead references**

```bash
grep -rn "TenantResolveResponse\|LegacyTenantResolveData\|class Tenant\b\|class RefreshToken\b\|class PrmServiceRecord\b\|api/tenants/resolve\|/resolve/" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src \
  --include="*.cs" \
  || echo "OK — no matches"
```

Expected: `OK — no matches`. Any match indicates a reference to a deleted symbol.

```bash
grep -rn "public Tenant Tenant\b\|public ICollection<RefreshToken>\|public Employee Employee\b" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared \
  --include="*.cs" \
  || echo "OK — no dead navs"
```

Expected: `OK — no dead navs`.

- [ ] **Step 9: Run the full test suite**

```bash
dotnet test /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 134, Failed: 0`.

- [ ] **Step 10: Commit**

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup add -A \
    backend/src/PrmDashboard.Shared \
    backend/src/PrmDashboard.TenantService
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup commit \
    -m "chore: delete /resolve endpoint, vestigial Shared EF entities, and dead navs"
```

---

## Task 2: Drop EF packages from `PrmDashboard.Shared.csproj`

With all EF-referencing code gone, the two remaining EF packages can be removed. The build is the self-verifying gate.

**Files:**
- Modify: `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj`

- [ ] **Step 1: Remove the two EF PackageReferences**

Open `backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj`. Delete these two lines from the `<ItemGroup>` containing `<PackageReference>` entries:

```xml
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.11" />
<PackageReference Include="Pomelo.EntityFrameworkCore.MySql" Version="8.0.2" />
```

Keep all other PackageReferences: `DuckDB.NET.Bindings.Full`, `DuckDB.NET.Data`, `Microsoft.Extensions.Hosting.Abstractions`, `Microsoft.Extensions.ObjectPool`, `Serilog`, `Serilog.AspNetCore`, `Serilog.Sinks.Console`, `Serilog.Enrichers.Environment`.

- [ ] **Step 2: Build**

```bash
dotnet build /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings. If errors reference `Microsoft.EntityFrameworkCore` or `Pomelo.*`, investigate — some code path still depends on the packages. This should not happen after Task 1 but the build is the truth.

- [ ] **Step 3: Grep for any remaining EF/MySQL references in source**

```bash
grep -rn "Microsoft.EntityFrameworkCore\|Pomelo.EntityFrameworkCore\|MySqlConnector" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src \
  --include="*.cs" --include="*.csproj" \
  || echo "OK — backend runtime is EF/MySQL-free"
```

Expected: `OK — backend runtime is EF/MySQL-free`. (The `tools/` directory is out of scope — `PrmDashboard.CsvExporter` still uses `MySqlConnector` for its one-shot legacy-data export, which is intentional.)

- [ ] **Step 4: Run the full test suite**

```bash
dotnet test /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 134, Failed: 0`.

- [ ] **Step 5: Commit**

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup add \
    backend/src/PrmDashboard.Shared/PrmDashboard.Shared.csproj
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup commit \
    -m "chore(shared): drop Microsoft.EntityFrameworkCore + Pomelo packages"
```

---

## Task 3: Apply Phase 3d-1 forward-concern fixes

Three small polish items flagged by the final Phase 3d-1 review but deferred until 3d-2.

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`
- Modify: `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`

### Fix 3a — `TrendService`: normalise parameter re-wrapping at 4 call sites

The file has 4 methods (`GetDailyAsync`, `GetMonthlyAsync`, `GetHourlyAsync`, `GetRequestedVsProvidedAsync`), each with a line like:

```csharp
foreach (var p in parms) cmd.Parameters.Add(p);
```

Change all 4 to:

```csharp
foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
```

### Fix 3b — `RecordService.GetSegmentsAsync`: same pattern

```csharp
foreach (var p in parms) cmd.Parameters.Add(p);
```

Change to:

```csharp
foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
```

### Fix 3c — `RecordService.GetRecordsAsync`: flatten nested using + add dedup comment

Current structure (simplified):

```csharp
await using (var countCmd = conn.CreateCommand())
{
    countCmd.CommandText = ...;
    foreach (var p in parms) countCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
    var total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));

    await using var cmd = conn.CreateCommand();
    cmd.CommandText = ...;
    // ... read page, build items, return PaginatedResponse
}
```

Flatten to sibling blocks. Declare `total` outside the first `using` block, compute it inside, then proceed with the page query at top level:

```csharp
long total;
await using (var countCmd = conn.CreateCommand())
{
    countCmd.CommandText = $@"
        SELECT COUNT(*) FROM (
            SELECT id FROM '{path}' WHERE {where}
            GROUP BY id
        )";
    foreach (var p in parms) countCmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
    total = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
}

// Dedup convention: `GROUP BY id + MIN(row_id)` is equivalent to
// `ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) = 1` used elsewhere.
// Kept here because the join-back-by-row_id shape reads cleaner with an
// explicit canonical CTE rather than a windowed subquery.
await using var cmd = conn.CreateCommand();
cmd.CommandText = $@"
    WITH canonical AS (
        SELECT id, MIN(row_id) AS row_id FROM '{path}'
        WHERE {where}
        GROUP BY id
    )
    SELECT t.row_id, t.id, t.flight, t.agent_name, t.passenger_name,
           t.prm_agent_type, t.start_time, t.paused_at, t.end_time,
           t.service, t.seat_number, t.pos_location, t.no_show_flag,
           t.loc_name, t.arrival, t.airline, t.departure, t.requested,
           t.service_date
    FROM '{path}' t
    INNER JOIN canonical c ON c.row_id = t.row_id
    ORDER BY t.{orderBy}
    LIMIT $limit OFFSET $offset";
foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));
cmd.Parameters.Add(new DuckDBParameter("limit", pageSize));
cmd.Parameters.Add(new DuckDBParameter("offset", (page - 1) * pageSize));

var items = new List<PrmRecordDto>();
await using var reader = await cmd.ExecuteReaderAsync(ct);
while (await reader.ReadAsync(ct))
{
    items.Add(new PrmRecordDto(
        RowId: reader.GetInt32(0),
        Id: reader.GetInt32(1),
        Flight: reader.GetString(2),
        AgentName: reader.IsDBNull(3) ? null : reader.GetString(3),
        PassengerName: reader.GetString(4),
        PrmAgentType: reader.GetString(5),
        StartTime: reader.GetInt32(6),
        PausedAt: reader.IsDBNull(7) ? null : reader.GetInt32(7),
        EndTime: reader.GetInt32(8),
        Service: reader.GetString(9),
        SeatNumber: reader.IsDBNull(10) ? null : reader.GetString(10),
        PosLocation: reader.IsDBNull(11) ? null : reader.GetString(11),
        NoShowFlag: reader.IsDBNull(12) ? null : reader.GetString(12),
        LocName: reader.GetString(13),
        Arrival: reader.IsDBNull(14) ? null : reader.GetString(14),
        Airline: reader.GetString(15),
        Departure: reader.IsDBNull(16) ? null : reader.GetString(16),
        Requested: reader.GetInt32(17),
        ServiceDate: DateOnly.FromDateTime(reader.GetDateTime(18))));
}

var totalPages = total == 0 ? 0 : (int)Math.Ceiling((double)total / pageSize);
_logger.LogInformation(
    "Records for {Slug}/{Airport}: page {Page}/{TotalPages}, {Count} items",
    tenantSlug, filters.Airport, page, totalPages, items.Count);

return new PaginatedResponse<PrmRecordDto>(items, (int)total, page, pageSize, totalPages);
```

Key changes:
- `long total;` declared at method scope.
- `countCmd`'s `using` block is closed BEFORE `cmd` is created — narrowest possible lifetime for the count command.
- The dedup-convention comment is placed immediately above the main page query.
- Overall method body nesting depth drops by one level.

- [ ] **Step 1: Apply Fix 3a (TrendService)**

Edit `backend/src/PrmDashboard.PrmService/Services/TrendService.cs`. Replace all 4 occurrences of `foreach (var p in parms) cmd.Parameters.Add(p);` with `foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));`.

Verify afterwards with:

```bash
grep -n "cmd.Parameters.Add(p)" /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.PrmService/Services/TrendService.cs
```

Expected: no output (no matches remain).

- [ ] **Step 2: Apply Fix 3b (RecordService.GetSegmentsAsync)**

Edit `backend/src/PrmDashboard.PrmService/Services/RecordService.cs`. In `GetSegmentsAsync`, replace the single `foreach (var p in parms) cmd.Parameters.Add(p);` with the wrapped version.

- [ ] **Step 3: Apply Fix 3c (RecordService.GetRecordsAsync flatten + comment)**

Edit the same file's `GetRecordsAsync`. Follow the restructured layout shown in Fix 3c. Three changes:

1. Declare `long total;` before the `await using (var countCmd = ...)` block.
2. Close the `countCmd` block after computing `total` (the block should no longer wrap `cmd` and the reader loop).
3. Add the dedup-convention comment (3 lines) immediately above `await using var cmd = conn.CreateCommand();`.

- [ ] **Step 4: Build**

```bash
dotnet build /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Run the full test suite**

```bash
dotnet test /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 134, Failed: 0`. Behaviour-preserving refactor.

- [ ] **Step 6: Verification grep — no bare `Add(p)` on raw parameter items**

```bash
grep -rn "cmd.Parameters.Add(p);" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.PrmService \
  --include="*.cs" \
  || echo "OK — all parameter adds use re-wrapping"
```

Expected: `OK — all parameter adds use re-wrapping`.

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup add \
    backend/src/PrmDashboard.PrmService/Services/TrendService.cs \
    backend/src/PrmDashboard.PrmService/Services/RecordService.cs
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup commit \
    -m "refactor(prm): normalise DuckDBParameter re-wrapping, flatten GetRecordsAsync, comment dedup"
```

---

## Task 4: Final verification (no commit)

- [ ] **Step 1: Solution builds clean**

```bash
dotnet build /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/PrmDashboard.sln --nologo --verbosity minimal
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: All tests pass**

```bash
dotnet test /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 134, Failed: 0`.

- [ ] **Step 3: Backend runtime is EF/MySQL-free**

```bash
grep -rn "Microsoft.EntityFrameworkCore\|Pomelo.EntityFrameworkCore\|MySqlConnector" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src \
  --include="*.cs" --include="*.csproj" \
  || echo "OK"
```

Expected: `OK`.

- [ ] **Step 4: `/resolve` endpoint gone**

```bash
grep -rn "api/tenants/resolve\|/resolve/" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src \
  --include="*.cs" \
  || echo "OK"
```

Expected: `OK`.

- [ ] **Step 5: Dead navs gone**

```bash
grep -rn "public Tenant Tenant\b\|public ICollection<RefreshToken>\|public Employee Employee\b" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared \
  --include="*.cs" \
  || echo "OK"
```

Expected: `OK`.

- [ ] **Step 6: Bare `Add(p)` gone from PrmService**

```bash
grep -rn "cmd.Parameters.Add(p);" \
  /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.PrmService \
  --include="*.cs" \
  || echo "OK"
```

Expected: `OK`.

- [ ] **Step 7: Shared/Models snapshot**

```bash
ls /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup/backend/src/PrmDashboard.Shared/Models/
```

Expected output (order may vary):

```text
Employee.cs  EmployeeAirport.cs  TenantInfo.cs
```

- [ ] **Step 8: Diff scope**

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup diff --stat main..HEAD
```

Expected: exactly the 8 files listed in the spec's file inventory (3 deleted + 5 modified), plus the 2 csproj edit for Task 2, plus `docs/superpowers/specs/2026-04-22-phase3d2-cleanup-design.md` and `docs/superpowers/plans/2026-04-22-phase3d2-cleanup.md`. No other files.

- [ ] **Step 9: Branch ready to merge**

```bash
git -C /c/Users/prera/dev-ai/angular_powerbi/.worktrees/phase3d2-cleanup log --oneline main..HEAD
```

Expected: 4 commits — docs (spec+plan), deletions, package drop, polish — plus optional docs-commit for the spec+plan themselves.

---

## Success criteria (recap from spec)

1. ✅ Task 4 Step 3 proves no EF/MySQL references in backend runtime source.
2. ✅ Task 4 Step 4 proves `/resolve` endpoint is gone.
3. ✅ Task 4 Step 5 proves EF navs are gone.
4. ✅ Task 4 Step 2 proves 134/134 tests pass.
5. ✅ Task 4 Step 1 proves build is 0/0.
6. ✅ Task 4 Step 7 proves Shared/Models has exactly the three expected files.
7. ✅ Task 4 Step 6 proves no bare `Add(p)` parameter pattern remains in PrmService.
8. ✅ Task 4 Step 8 proves no scope leakage outside the spec's file inventory.
