# Phase 3b — AuthService Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap `PrmDashboard.AuthService` from EF Core + MySQL to DuckDB + Parquet + an in-memory refresh-token store. All four endpoints (`/login`, `/refresh`, `/logout`, `/me`) remain behaviorally identical from the frontend's perspective.

**Architecture:** A new `InMemoryRefreshTokenStore` singleton wraps `ConcurrentDictionary<string, RefreshTokenEntry>` and exposes `Add`/`TryConsume`/`Revoke`. `AuthenticationService` is rewritten: it injects `IDuckDbContext` + `TenantParquetPaths` + `InMemoryRefreshTokenStore` (all from Phase 3a + this phase) and runs raw DuckDB SQL over `master/*.parquet`. `Program.cs` swaps `AddDbContext<MasterDbContext>` for the foundation wiring. `AuthController` takes one-line tuple/record-shape adjustments. `MasterDbContext.cs` is deleted. The three MySQL/EF packages leave `PrmDashboard.AuthService.csproj`.

**Tech Stack:**
- .NET 8 AuthService project, already exists
- `DuckDB.NET.Data` 1.5.0 + `DuckDB.NET.Bindings.Full` 1.5.0 — consumed transitively via `PrmDashboard.Shared` (from Phase 3a)
- `BCrypt.Net-Next` (already a direct package reference — unchanged)
- `Microsoft.AspNetCore.Authentication.JwtBearer`, `System.IdentityModel.Tokens.Jwt` (unchanged)
- xUnit for new unit + integration tests in the existing `PrmDashboard.Tests` project (67 existing tests stay)

---

## Spec resolutions baked into this plan

The Phase 3b design spec (`docs/superpowers/specs/2026-04-21-phase3b-auth-service-design.md`) lists three open items. This plan locks them:

1. **DuckDB.NET.Data parameter style** — uses **named** `$param` placeholders via `DuckDBParameter(name, value)`. This is the unambiguous form that `DuckDB.NET.Data 1.5.0` documents in its README. Example pattern pinned in Task 2.
2. **Reading VARCHAR / TIMESTAMP / BOOLEAN from `DuckDBDataReader`** — uses typed getters: `GetString(i)`, `GetDateTime(i)`, `GetBoolean(i)`. NULLs are checked with `IsDBNull(i)` first. Same pattern Phase 3a integration tests validated.
3. **`AuthController.Login` adjustment** — one line: the `CreateRefreshTokenAsync` call gains a `tenantSlug` argument, and its return value is a `RefreshTokenIssued` record (not `RefreshToken` entity). One call site, tiny diff.

---

## Files to create/modify

Create:
- `backend/src/PrmDashboard.AuthService/Services/InMemoryRefreshTokenStore.cs` — store + `RefreshTokenEntry` internal record + `RefreshTokenIssued` wire record
- `backend/tests/PrmDashboard.Tests/AuthService/InMemoryRefreshTokenStoreTests.cs` — 8 unit tests
- `backend/tests/PrmDashboard.Tests/AuthService/AuthenticationServiceTests.cs` — 8 integration tests with real Parquet fixtures

Modify:
- `backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs` — rewrite (EF → DuckDB + store)
- `backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs` — two one-line call-site adjustments
- `backend/src/PrmDashboard.AuthService/Program.cs` — swap DI wiring
- `backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj` — remove 3 packages (Pomelo, EF, MySqlConnector)
- `backend/src/PrmDashboard.AuthService/appsettings.Development.json` — replace `ConnectionStrings:MasterDb` with `DataPath`

Delete:
- `backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs` — and the empty `Data/` folder

**No other files** are modified. In particular, no TenantService/PrmService/Gateway code, no Shared models, no docker-compose, no frontend.

---

## Pre-task: branch state

From the repo root:

```bash
git log --oneline -3
```

Expected (or later):

```text
2c48447 docs(spec): phase 3b AuthService swap design
fd5e726 feat(shared): add DataPathValidator IHostedService with tests
...
```

Plus the plan-doc commit when this runs. The branch is `phase3b-auth-service`. All Phase-3b work lands there.

---

### Task 1: `InMemoryRefreshTokenStore` + records + unit tests

The pool-adjacent primitive. Pure logic, no DuckDB. Strict TDD.

**Files:**
- Create: `backend/src/PrmDashboard.AuthService/Services/InMemoryRefreshTokenStore.cs`
- Create: `backend/tests/PrmDashboard.Tests/AuthService/InMemoryRefreshTokenStoreTests.cs`

- [ ] **Step 1: Write the failing tests**

Write `backend/tests/PrmDashboard.Tests/AuthService/InMemoryRefreshTokenStoreTests.cs`:

```csharp
using System.Threading.Tasks;
using PrmDashboard.AuthService.Services;
using Xunit;

namespace PrmDashboard.Tests.AuthService;

public class InMemoryRefreshTokenStoreTests
{
    private static RefreshTokenEntry FutureEntry(int employeeId = 1, string slug = "aeroground")
        => new(employeeId, slug, DateTime.UtcNow.AddDays(7));

    private static RefreshTokenEntry ExpiredEntry(int employeeId = 1, string slug = "aeroground")
        => new(employeeId, slug, DateTime.UtcNow.AddHours(-1));

    [Fact]
    public void Add_NewToken_CanBeConsumed()
    {
        var store = new InMemoryRefreshTokenStore();
        var entry = FutureEntry();
        store.Add("abc", entry);

        Assert.True(store.TryConsume("abc", out var retrieved));
        Assert.Equal(entry, retrieved);
    }

    [Fact]
    public void Add_DuplicateToken_Throws()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());
        Assert.Throws<InvalidOperationException>(() => store.Add("abc", FutureEntry()));
    }

    [Fact]
    public void TryConsume_ValidToken_ReturnsEntryAndRemoves()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());

        Assert.True(store.TryConsume("abc", out _));
        Assert.False(store.TryConsume("abc", out _)); // removed after first consume
    }

    [Fact]
    public void TryConsume_ExpiredToken_ReturnsFalseAndRemoves()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", ExpiredEntry());

        Assert.False(store.TryConsume("abc", out _));
        // Expired entry is purged — a later add of the same token works
        store.Add("abc", FutureEntry());
        Assert.True(store.TryConsume("abc", out _));
    }

    [Fact]
    public void TryConsume_UnknownToken_ReturnsFalse()
    {
        var store = new InMemoryRefreshTokenStore();
        Assert.False(store.TryConsume("never-added", out _));
    }

    [Fact]
    public async Task TryConsume_RaceBetweenTwoThreads_OnlyOneWins()
    {
        // Atomic-rotation regression guard: two concurrent TryConsume calls on the same
        // token must produce exactly one true result.
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());

        var t1 = Task.Run(() => store.TryConsume("abc", out _));
        var t2 = Task.Run(() => store.TryConsume("abc", out _));

        var results = await Task.WhenAll(t1, t2);
        // Exactly one winner
        Assert.Equal(1, results.Count(r => r));
    }

    [Fact]
    public void Revoke_KnownToken_Removes()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Add("abc", FutureEntry());
        store.Revoke("abc");
        Assert.False(store.TryConsume("abc", out _));
    }

    [Fact]
    public void Revoke_UnknownToken_Ignored()
    {
        var store = new InMemoryRefreshTokenStore();
        store.Revoke("never-added"); // must not throw
    }
}
```

- [ ] **Step 2: Run tests — must fail because the types don't exist yet**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~InMemoryRefreshTokenStoreTests"
```

Expected: compile error citing `InMemoryRefreshTokenStore` and `RefreshTokenEntry`.

- [ ] **Step 3: Implement the store and records**

Write `backend/src/PrmDashboard.AuthService/Services/InMemoryRefreshTokenStore.cs`:

```csharp
using System.Collections.Concurrent;

namespace PrmDashboard.AuthService.Services;

/// <summary>
/// Internal refresh-token record. Held in the in-memory dictionary keyed by the
/// cryptographically-random token string itself. The dictionary value holds only
/// what's needed to reissue a JWT on refresh — employee details (name, airports)
/// are re-read from Parquet each time to avoid staleness.
/// </summary>
public sealed record RefreshTokenEntry(int EmployeeId, string TenantSlug, DateTime ExpiresAt);

/// <summary>
/// Wire-shape record returned from <see cref="AuthenticationService.CreateRefreshTokenAsync"/>.
/// Kept separate from <see cref="RefreshTokenEntry"/> so the controller doesn't see
/// the EmployeeId/TenantSlug the store holds internally.
/// </summary>
public sealed record RefreshTokenIssued(string Token, DateTime ExpiresAt);

/// <summary>
/// In-memory refresh-token store. Singleton DI. Replaces the <c>refresh_tokens</c>
/// MySQL table from the legacy AuthService. Process restart invalidates all tokens —
/// an accepted POC compromise per the Phase 3 migration spec.
/// </summary>
public sealed class InMemoryRefreshTokenStore
{
    private readonly ConcurrentDictionary<string, RefreshTokenEntry> _tokens = new();

    /// <summary>
    /// Adds a new token. Token strings are cryptographically random, so collisions are
    /// effectively impossible. If a collision does happen, throws — indicates a bug.
    /// </summary>
    public void Add(string token, RefreshTokenEntry entry)
    {
        if (!_tokens.TryAdd(token, entry))
            throw new InvalidOperationException("Refresh token collision — this should be effectively impossible.");
    }

    /// <summary>
    /// Atomically removes and returns the token entry if it exists AND has not expired.
    /// Returns false if the token is unknown, already consumed, or expired. Expired
    /// entries are removed either way (housekeeping).
    /// </summary>
    public bool TryConsume(string token, out RefreshTokenEntry entry)
    {
        if (!_tokens.TryRemove(token, out var candidate))
        {
            entry = default!;
            return false;
        }

        if (candidate.ExpiresAt <= DateTime.UtcNow)
        {
            entry = default!;
            return false;
        }

        entry = candidate;
        return true;
    }

    /// <summary>
    /// Removes a token if present. No-op if not. Used by logout.
    /// </summary>
    public void Revoke(string token) => _tokens.TryRemove(token, out _);
}
```

- [ ] **Step 4: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~InMemoryRefreshTokenStoreTests"
```

Expected: `Passed: 8`. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/PrmDashboard.AuthService/Services/InMemoryRefreshTokenStore.cs backend/tests/PrmDashboard.Tests/AuthService/InMemoryRefreshTokenStoreTests.cs
git commit -m "feat(auth): add InMemoryRefreshTokenStore with atomic TryConsume"
```

---

### Task 2: Rewrite `AuthenticationService` — EF to DuckDB + store

Single biggest task. Rewrites ~170 LOC of existing service. Compiles at the end — old `MasterDbContext` no longer referenced by service code. DI registration still broken until Task 4, but tests from Task 1 continue to pass and the project builds.

**Files:**
- Modify: `backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs`

- [ ] **Step 1: Read the existing service**

```bash
cat backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs
```

Note the current constructor takes `MasterDbContext, JwtService, IConfiguration, ILogger`. The rewrite keeps the last three and swaps the first for `IDuckDbContext + TenantParquetPaths + InMemoryRefreshTokenStore`.

- [ ] **Step 2: Replace the file contents**

Write `backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs` (overwrites existing):

```csharp
using System.Data;
using DuckDB.NET.Data;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using PrmDashboard.Shared.Models;

namespace PrmDashboard.AuthService.Services;

public class AuthenticationService
{
    private const string BcryptPendingPrefix = "BCRYPT_PENDING:";

    private readonly IDuckDbContext _duck;
    private readonly TenantParquetPaths _paths;
    private readonly InMemoryRefreshTokenStore _tokens;
    private readonly JwtService _jwt;
    private readonly IConfiguration _config;
    private readonly ILogger<AuthenticationService> _logger;

    public AuthenticationService(
        IDuckDbContext duck,
        TenantParquetPaths paths,
        InMemoryRefreshTokenStore tokens,
        JwtService jwt,
        IConfiguration config,
        ILogger<AuthenticationService> logger)
    {
        _duck = duck;
        _paths = paths;
        _tokens = tokens;
        _jwt = jwt;
        _config = config;
        _logger = logger;
    }

    public async Task<LoginResponse?> LoginAsync(string tenantSlug, LoginRequest request, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);

        var tenant = await LookupTenantAsync(session.Connection, tenantSlug, ct);
        if (tenant is null)
        {
            _logger.LogWarning("Login failed: unknown or inactive tenant {TenantSlug}", tenantSlug);
            return null;
        }

        var (employee, airports, passwordHash) = await LookupEmployeeByUsernameAsync(
            session.Connection, tenant.Id, request.Username, ct);
        if (employee is null)
        {
            _logger.LogWarning("Login failed: unknown user {Username} for tenant {TenantId}",
                request.Username, tenant.Id);
            return null;
        }

        if (!VerifyPassword(passwordHash!, request.Password, employee.Id))
        {
            _logger.LogWarning("Login failed: bad password for employee {EmployeeId}", employee.Id);
            return null;
        }

        // Audit log replaces the legacy last_login UPDATE — Parquet is read-only at runtime
        _logger.LogInformation("AuthEvent login employee={EmployeeId} tenant={TenantSlug} at {Timestamp}",
            employee.Id, tenantSlug, DateTime.UtcNow);

        // employee.Airports is already populated by MaterializeEmployeeRowsAsync.
        // JwtService.GenerateAccessToken needs employee.TenantId for the tenant_id claim,
        // so pass the materialized Employee directly — do not substitute a stub.
        var accessToken = _jwt.GenerateAccessToken(employee, tenantSlug);

        var employeeDto = new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList());

        return new LoginResponse(accessToken, employeeDto);
    }

    /// <summary>
    /// Verifies the supplied password against the stored hash. Supports the
    /// <c>BCRYPT_PENDING:&lt;plaintext&gt;</c> seed-bootstrap format for back-compat with
    /// Phase 1 Parquet dumps — the self-upgrade-on-first-login path is intentionally
    /// dropped because Parquet is read-only at runtime.
    /// </summary>
    private bool VerifyPassword(string storedHash, string supplied, int employeeId)
    {
        if (storedHash.StartsWith(BcryptPendingPrefix, StringComparison.Ordinal))
        {
            var expected = storedHash[BcryptPendingPrefix.Length..];
            var matches = string.Equals(supplied, expected, StringComparison.Ordinal);
            if (matches)
            {
                _logger.LogWarning(
                    "BCRYPT_PENDING plaintext hash accepted for employee {EmployeeId} — regenerate master Parquet with real bcrypt hashes to eliminate.",
                    employeeId);
            }
            return matches;
        }

        return BCrypt.Net.BCrypt.Verify(supplied, storedHash);
    }

    public async Task<RefreshTokenIssued> CreateRefreshTokenAsync(int employeeId, string tenantSlug, CancellationToken ct = default)
    {
        var refreshDays = int.TryParse(_config["Jwt:RefreshTokenDays"], out var d) && d > 0 ? d : 7;
        var token = _jwt.GenerateRefreshToken();
        var expiresAt = DateTime.UtcNow.AddDays(refreshDays);

        _tokens.Add(token, new RefreshTokenEntry(employeeId, tenantSlug, expiresAt));
        return new RefreshTokenIssued(token, expiresAt);
    }

    public async Task<(string? accessToken, string? newRefreshToken, DateTime? newExpiresAt)> RefreshAsync(
        string token, CancellationToken ct = default)
    {
        if (!_tokens.TryConsume(token, out var consumed))
        {
            _logger.LogWarning("Refresh failed: token not found, already consumed, or expired");
            return (null, null, null);
        }

        await using var session = await _duck.AcquireAsync(ct);
        var (employee, airports, _) = await LookupEmployeeByIdAsync(session.Connection, consumed.EmployeeId, ct);
        if (employee is null)
        {
            _logger.LogWarning("Refresh failed: employee {EmployeeId} no longer exists or is inactive", consumed.EmployeeId);
            return (null, null, null);
        }

        // Materialized employee.Airports + TenantId already populated; pass directly
        var accessToken = _jwt.GenerateAccessToken(employee, consumed.TenantSlug);
        var issued = await CreateRefreshTokenAsync(consumed.EmployeeId, consumed.TenantSlug, ct);

        return (accessToken, issued.Token, issued.ExpiresAt);
    }

    public Task RevokeRefreshTokenAsync(string token, CancellationToken ct = default)
    {
        _tokens.Revoke(token);
        return Task.CompletedTask;
    }

    public async Task<EmployeeDto?> GetProfileAsync(int employeeId, CancellationToken ct = default)
    {
        await using var session = await _duck.AcquireAsync(ct);
        var (employee, airports, _) = await LookupEmployeeByIdAsync(session.Connection, employeeId, ct);
        if (employee is null) return null;

        return new EmployeeDto(
            employee.Id,
            employee.DisplayName,
            employee.Email,
            airports.Select(a => new AirportDto(a.AirportCode, a.AirportName)).ToList());
    }

    // -------------------- private DuckDB helpers --------------------

    private async Task<TenantInfo?> LookupTenantAsync(DuckDBConnection conn, string slug, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT id, name, slug, is_active, created_at, logo_url, primary_color
            FROM '{EscapeSingleQuotes(_paths.MasterTenants)}'
            WHERE slug = $slug AND is_active
            LIMIT 1
            """;
        cmd.Parameters.Add(new DuckDBParameter("slug", slug));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new TenantInfo(
            Id: reader.GetInt32(0),
            Name: reader.GetString(1),
            Slug: reader.GetString(2),
            IsActive: reader.GetBoolean(3),
            CreatedAt: reader.GetDateTime(4),
            LogoUrl: reader.IsDBNull(5) ? null : reader.GetString(5),
            PrimaryColor: reader.GetString(6));
    }

    /// <summary>
    /// Returns (employee, airports, passwordHash). Null employee if not found or inactive.
    /// Password hash is kept separate from the returned <see cref="Employee"/> so tests +
    /// JWT generation never see it.
    /// </summary>
    private async Task<(Employee?, List<EmployeeAirport>, string?)> LookupEmployeeByUsernameAsync(
        DuckDBConnection conn, int tenantId, string username, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT e.id, e.tenant_id, e.username, e.password_hash, e.display_name, e.email,
                   e.is_active, e.created_at, e.last_login,
                   ea.airport_code, ea.airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployees)}' e
            LEFT JOIN '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}' ea
              ON ea.employee_id = e.id
            WHERE e.tenant_id = $tid AND e.username = $uname AND e.is_active
            ORDER BY e.id, ea.airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("tid", tenantId));
        cmd.Parameters.Add(new DuckDBParameter("uname", username));

        return await MaterializeEmployeeRowsAsync(cmd, ct);
    }

    private async Task<(Employee?, List<EmployeeAirport>, string?)> LookupEmployeeByIdAsync(
        DuckDBConnection conn, int employeeId, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"""
            SELECT e.id, e.tenant_id, e.username, e.password_hash, e.display_name, e.email,
                   e.is_active, e.created_at, e.last_login,
                   ea.airport_code, ea.airport_name
            FROM '{EscapeSingleQuotes(_paths.MasterEmployees)}' e
            LEFT JOIN '{EscapeSingleQuotes(_paths.MasterEmployeeAirports)}' ea
              ON ea.employee_id = e.id
            WHERE e.id = $eid AND e.is_active
            ORDER BY ea.airport_code
            """;
        cmd.Parameters.Add(new DuckDBParameter("eid", employeeId));

        return await MaterializeEmployeeRowsAsync(cmd, ct);
    }

    private static async Task<(Employee?, List<EmployeeAirport>, string?)> MaterializeEmployeeRowsAsync(
        DuckDBCommand cmd, CancellationToken ct)
    {
        await using var reader = await cmd.ExecuteReaderAsync(ct);

        Employee? emp = null;
        string? passwordHash = null;
        var airports = new List<EmployeeAirport>();

        while (await reader.ReadAsync(ct))
        {
            if (emp is null)
            {
                emp = new Employee
                {
                    Id = reader.GetInt32(0),
                    TenantId = reader.GetInt32(1),
                    Username = reader.GetString(2),
                    DisplayName = reader.GetString(4),
                    Email = reader.IsDBNull(5) ? null : reader.GetString(5),
                    IsActive = reader.GetBoolean(6),
                    CreatedAt = reader.GetDateTime(7),
                    LastLogin = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                };
                passwordHash = reader.GetString(3);
            }

            if (!reader.IsDBNull(9))
            {
                airports.Add(new EmployeeAirport
                {
                    EmployeeId = emp.Id,
                    AirportCode = reader.GetString(9),
                    AirportName = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                });
            }
        }

        if (emp is not null)
        {
            emp.Airports = airports;
        }
        return (emp, airports, passwordHash);
    }

    private static string EscapeSingleQuotes(string path) => path.Replace("'", "''");
}
```

- [ ] **Step 3: Build AuthService project to confirm compilation**

```bash
dotnet build backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. The service compiles because `MasterDbContext` still exists (not deleted until Task 4), but `AuthenticationService` no longer references it.

If the build fails with `CS0103: 'DuckDBParameter' does not exist` or similar, the DuckDB package reference in Shared hasn't propagated — re-check Phase 3a Task 1 landed correctly.

- [ ] **Step 4: Full solution build — must succeed**

```bash
dotnet build backend/PrmDashboard.sln
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. MasterDbContext.cs is dead code at this point (still references EF types and compiles on its own), but the DI registration in Program.cs still wires it up, so runtime would fail if you started the service. That's fixed in Task 4. Unit tests from Task 1 + pre-existing tests still pass.

- [ ] **Step 5: Run the test suite — must still pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 75` (67 pre-existing + 8 Task 1 store tests). Zero failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs
git commit -m "feat(auth): rewrite AuthenticationService to use DuckDB + in-memory refresh store"
```

---

### Task 3: Adjust `AuthController` for new service signatures

Two one-line changes at the call sites for the refresh-token methods. Controller structure, routing, cookie handling, rate-limiting attributes all unchanged.

**Files:**
- Modify: `backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs`

- [ ] **Step 1: Update the `Login` handler's `CreateRefreshTokenAsync` call**

In `backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs`, replace:

```csharp
        // Create refresh token and set as httpOnly cookie
        var refreshToken = await _authService.CreateRefreshTokenAsync(result.Employee.Id, ct);
        SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);
```

With:

```csharp
        // Create refresh token and set as httpOnly cookie
        var refresh = await _authService.CreateRefreshTokenAsync(result.Employee.Id, tenantSlug, ct);
        SetRefreshTokenCookie(refresh.Token, refresh.ExpiresAt);
```

The name change (`refreshToken` → `refresh`) is cosmetic but makes it clear the value is now `RefreshTokenIssued`, not the old EF entity. The `tenantSlug` is already a local variable in the method (read from the header earlier).

- [ ] **Step 2: Update the `Refresh` handler's tuple destructure**

In the same file, replace:

```csharp
        var (accessToken, newRefreshToken) = await _authService.RefreshAsync(token, ct);
        if (accessToken == null || newRefreshToken == null)
            return Problem(detail: "Invalid or expired refresh token", statusCode: 401, title: "Unauthorized");

        SetRefreshTokenCookie(newRefreshToken.Token, newRefreshToken.ExpiresAt);
        return Ok(new RefreshResponse(accessToken));
```

With:

```csharp
        var (accessToken, newRefreshToken, newExpiresAt) = await _authService.RefreshAsync(token, ct);
        if (accessToken == null || newRefreshToken == null || newExpiresAt == null)
            return Problem(detail: "Invalid or expired refresh token", statusCode: 401, title: "Unauthorized");

        SetRefreshTokenCookie(newRefreshToken, newExpiresAt.Value);
        return Ok(new RefreshResponse(accessToken));
```

Key changes: third tuple element `newExpiresAt` added; null-check updated to include it; `SetRefreshTokenCookie` now receives `newRefreshToken` (string) and `newExpiresAt.Value` (DateTime) directly instead of property access on an EF entity.

- [ ] **Step 3: Build AuthService — must succeed**

```bash
dotnet build backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs
git commit -m "refactor(auth): align AuthController with new service signatures"
```

---

### Task 4: Swap `Program.cs` wiring, delete `MasterDbContext`, drop MySQL/EF packages

End state: AuthService runs against `/data` via DuckDB + in-memory token store, with zero MySQL/EF dependencies.

**Files:**
- Modify: `backend/src/PrmDashboard.AuthService/Program.cs`
- Modify: `backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj`
- Modify: `backend/src/PrmDashboard.AuthService/appsettings.Development.json`
- Delete: `backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs`

- [ ] **Step 1: Rewrite `Program.cs`**

Write `backend/src/PrmDashboard.AuthService/Program.cs` (full replacement — `Data/MasterDbContext.cs` references get removed here):

```csharp
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.Logging;
using PrmDashboard.Shared.Middleware;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.AddPrmSerilog(serviceName: "auth");

// Bind to port 8080 inside the container
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(8080));

// Services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret is required");
var jwtIssuer = builder.Configuration["Jwt:Issuer"]
    ?? throw new InvalidOperationException("Jwt:Issuer is required");
var jwtAudience = builder.Configuration["Jwt:Audience"]
    ?? throw new InvalidOperationException("Jwt:Audience is required");

// Phase 3a foundation: DuckDB + Parquet data path
builder.Services.Configure<DataPathOptions>(o =>
{
    o.Root = Environment.GetEnvironmentVariable("PRM_DATA_PATH")
             ?? builder.Configuration["DataPath"]
             ?? throw new InvalidOperationException(
                 "Data path required: set PRM_DATA_PATH env var or DataPath in appsettings.");

    o.PoolSize = builder.Configuration.GetValue<int?>("DataPath:PoolSize")
                 ?? DataPathOptions.DefaultPoolSize;

    if (o.PoolSize < DataPathOptions.MinPoolSize || o.PoolSize > DataPathOptions.MaxPoolSize)
        throw new InvalidOperationException(
            $"DataPath:PoolSize out of range [{DataPathOptions.MinPoolSize}, {DataPathOptions.MaxPoolSize}]: {o.PoolSize}");
});

builder.Services.AddHostedService<DataPathValidator>();
builder.Services.AddSingleton<IDuckDbContext, DuckDbContext>();
builder.Services.AddSingleton<TenantParquetPaths>();
builder.Services.AddSingleton<InMemoryRefreshTokenStore>();

// JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });

builder.Services.AddAuthorization();

// Auth services
builder.Services.AddSingleton<JwtService>();
builder.Services.AddScoped<AuthenticationService>();

// Rate limiting — protect auth endpoints from brute-force / abuse
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.ContentType = "application/problem+json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            type = "https://tools.ietf.org/html/rfc6585#section-4",
            title = "Too Many Requests",
            status = 429,
            detail = "Rate limit exceeded. Please slow down and try again."
        }, ct);
    };

    options.AddPolicy("auth-strict", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("auth-standard", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 20,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

// CORS — allowlist from config
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy.WithOrigins(allowedOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging(opts =>
{
    opts.MessageTemplate =
        "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0}ms [corr={CorrelationId}]";
});

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "auth" }));
app.MapControllers();

app.Run();
```

Key diff from the old file: removed `using Microsoft.EntityFrameworkCore;`, `using PrmDashboard.AuthService.Data;`, the `connStr` read, and the `AddDbContext<MasterDbContext>(opt => opt.UseMySql(...))` line. Added the Phase 3a foundation block (DataPathOptions + DataPathValidator + IDuckDbContext + TenantParquetPaths) plus `AddSingleton<InMemoryRefreshTokenStore>()`.

- [ ] **Step 2: Delete `MasterDbContext.cs`**

```bash
rm backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs
rmdir backend/src/PrmDashboard.AuthService/Data 2>/dev/null || true
```

The `rmdir` removes the now-empty `Data/` directory; the `|| true` swallows the error if the directory has any stray file (it shouldn't on a clean clone).

- [ ] **Step 3: Remove MySQL/EF packages from AuthService csproj**

Read `backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj` to see the current package list. The three packages to remove are `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, and `MySqlConnector`.

Run:

```bash
dotnet remove backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj package Pomelo.EntityFrameworkCore.MySql
dotnet remove backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj package Microsoft.EntityFrameworkCore
dotnet remove backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj package MySqlConnector
```

Each command may print `warn : Package '...' not found in '...'` if one of them wasn't actually a direct reference (it was transitive) — that's fine, continue.

- [ ] **Step 4: Update `appsettings.Development.json`**

Read `backend/src/PrmDashboard.AuthService/appsettings.Development.json`:

```bash
cat backend/src/PrmDashboard.AuthService/appsettings.Development.json
```

Replace the `ConnectionStrings` block with a `DataPath` entry. Final file should look roughly like:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Debug",
      "Microsoft.AspNetCore": "Information"
    }
  },
  "DataPath": "../../../data",
  "Jwt": {
    "Secret": "dev-secret-do-not-use-in-production-this-is-a-long-string-for-hs256",
    "Issuer": "prm-dashboard",
    "Audience": "prm-dashboard-client",
    "RefreshTokenDays": "7"
  },
  "Cors": {
    "AllowedOrigins": [
      "http://localhost:4200",
      "http://aeroground.localhost:4200",
      "http://skyserve.localhost:4200",
      "http://globalprm.localhost:4200"
    ]
  }
}
```

The key change: `ConnectionStrings.MasterDb` is gone, `DataPath` is added. The value `"../../../data"` is a relative path from the service's `bin/Debug/net8.0/` output directory back to the repo-root `data/` folder (3 directory levels up). Keep the original JSON structure and other settings (`Jwt`, `Cors`) exactly as they were — only the `ConnectionStrings` → `DataPath` swap.

If the service currently has `ConnectionStrings` and other blocks not shown above, preserve them. If the file has non-standard settings specific to your local dev, preserve those too. The only substantive edit is the connection-string swap.

- [ ] **Step 5: Build full solution — must succeed**

```bash
dotnet build backend/PrmDashboard.sln
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`. If you see compile errors citing `MasterDbContext`, something still references it — grep `backend/src/PrmDashboard.AuthService` to find the stragglers.

- [ ] **Step 6: Grep-verify the swap is complete**

```bash
grep -rE "MySqlConnector|Pomelo|EntityFrameworkCore|MasterDbContext" backend/src/PrmDashboard.AuthService 2>/dev/null || echo "AuthService is clean"
```

Expected: `AuthService is clean` (no matches).

- [ ] **Step 7: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected: `Passed: 75` (unchanged from Task 2 since we haven't added integration tests yet).

- [ ] **Step 8: Commit**

```bash
git add backend/src/PrmDashboard.AuthService/Program.cs
git add backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj
git add backend/src/PrmDashboard.AuthService/appsettings.Development.json
git add -u backend/src/PrmDashboard.AuthService/Data
git commit -m "chore(auth): wire DuckDB + data path, drop MySQL/EF packages and DbContext"
```

The `git add -u backend/src/PrmDashboard.AuthService/Data` stages the deletion of `MasterDbContext.cs` and (if removed) the empty `Data/` directory.

---

### Task 5: Integration tests for `AuthenticationService` against real Parquet

Exercises the full auth flow end-to-end with a real DuckDB + real Parquet fixtures. Same `IAsyncLifetime` pattern as Phase 3a's `DuckDbContextTests`.

**Files:**
- Create: `backend/tests/PrmDashboard.Tests/AuthService/AuthenticationServiceTests.cs`

- [ ] **Step 1: Write the test file**

Write `backend/tests/PrmDashboard.Tests/AuthService/AuthenticationServiceTests.cs`:

```csharp
using System.IO;
using System.Threading.Tasks;
using DuckDB.NET.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PrmDashboard.AuthService.Services;
using PrmDashboard.Shared.Data;
using PrmDashboard.Shared.DTOs;
using Xunit;

namespace PrmDashboard.Tests.AuthService;

public class AuthenticationServiceTests : IAsyncLifetime
{
    private string _tempRoot = "";
    private AuthenticationService _sut = null!;
    private InMemoryRefreshTokenStore _store = null!;

    // Fixture data values
    private const int TenantId = 7;
    private const string TenantSlug = "testco";
    private const int EmployeeId = 42;
    private const string Username = "alice";
    private const string Password = "correct-horse-battery-staple";
    private const string DisplayName = "Alice Tester";
    private const string Email = "alice@example.com";

    public async Task InitializeAsync()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"authsvc-test-{System.Guid.NewGuid():N}");
        var masterDir = Path.Combine(_tempRoot, "master");
        Directory.CreateDirectory(masterDir);

        var tenantsPath = Path.Combine(masterDir, "tenants.parquet");
        var employeesPath = Path.Combine(masterDir, "employees.parquet");
        var airportsPath = Path.Combine(masterDir, "employee_airports.parquet");

        // Build a tiny master fixture via DuckDB's COPY statements.
        await using var setupConn = new DuckDBConnection("DataSource=:memory:");
        await setupConn.OpenAsync();

        var bcryptHash = BCrypt.Net.BCrypt.HashPassword(Password);

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {TenantId}::INTEGER AS id,
                           'Test Co'::VARCHAR AS name,
                           '{TenantSlug}'::VARCHAR AS slug,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::VARCHAR AS logo_url,
                           '#000000'::VARCHAR AS primary_color
                ) TO '{tenantsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT {EmployeeId}::INTEGER AS id,
                           {TenantId}::INTEGER AS tenant_id,
                           '{Username}'::VARCHAR AS username,
                           '{bcryptHash.Replace("'", "''")}'::VARCHAR AS password_hash,
                           '{DisplayName}'::VARCHAR AS display_name,
                           '{Email}'::VARCHAR AS email,
                           TRUE::BOOLEAN AS is_active,
                           TIMESTAMP '2026-01-01 00:00:00' AS created_at,
                           NULL::TIMESTAMP AS last_login
                    UNION ALL
                    SELECT 43, {TenantId}, 'bob_pending',
                           'BCRYPT_PENDING:plainpass',
                           'Bob Bootstrap', 'bob@example.com',
                           TRUE, TIMESTAMP '2026-01-01 00:00:00', NULL
                ) TO '{employeesPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        await using (var cmd = setupConn.CreateCommand())
        {
            cmd.CommandText = $"""
                COPY (
                    SELECT 1::INTEGER AS id, {EmployeeId}::INTEGER AS employee_id,
                           'DEL'::VARCHAR AS airport_code, 'Delhi'::VARCHAR AS airport_name
                    UNION ALL
                    SELECT 2, {EmployeeId}, 'BOM', 'Mumbai'
                ) TO '{airportsPath.Replace("'", "''")}' (FORMAT 'parquet');
                """;
            await cmd.ExecuteNonQueryAsync();
        }

        // Wire up the SUT with real foundation primitives pointed at the fixture.
        var options = Options.Create(new DataPathOptions { Root = _tempRoot, PoolSize = 4 });
        var duck = new DuckDbContext(options);
        var paths = new TenantParquetPaths(options);
        _store = new InMemoryRefreshTokenStore();

        var jwtConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "test-secret-key-at-least-32-bytes-long-for-hs256",
                ["Jwt:Issuer"] = "test-issuer",
                ["Jwt:Audience"] = "test-audience",
                ["Jwt:AccessTokenMinutes"] = "15",
                ["Jwt:RefreshTokenDays"] = "7",
            })
            .Build();

        var jwt = new JwtService(jwtConfig);

        _sut = new AuthenticationService(
            duck,
            paths,
            _store,
            jwt,
            jwtConfig,
            NullLogger<AuthenticationService>.Instance);
    }

    public Task DisposeAsync()
    {
        try { Directory.Delete(_tempRoot, recursive: true); } catch { /* best-effort */ }
        return Task.CompletedTask;
    }

    [Fact]
    public async Task LoginAsync_ValidCredentials_ReturnsResponse()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest(Username, Password), CancellationToken.None);

        Assert.NotNull(result);
        Assert.False(string.IsNullOrEmpty(result!.AccessToken));
        Assert.Equal(EmployeeId, result.Employee.Id);
        Assert.Equal(DisplayName, result.Employee.DisplayName);
        Assert.Equal(2, result.Employee.Airports.Count);
        Assert.Contains(result.Employee.Airports, a => a.AirportCode == "DEL");
        Assert.Contains(result.Employee.Airports, a => a.AirportCode == "BOM");
    }

    [Fact]
    public async Task LoginAsync_UnknownTenant_ReturnsNull()
    {
        var result = await _sut.LoginAsync("ghost-tenant", new LoginRequest(Username, Password), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_UnknownUser_ReturnsNull()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest("nobody", Password), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_WrongPassword_ReturnsNull()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest(Username, "nope"), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_BcryptPendingPrefix_VerifiesViaPlaintext()
    {
        var result = await _sut.LoginAsync(TenantSlug, new LoginRequest("bob_pending", "plainpass"), CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal(43, result!.Employee.Id);
    }

    [Fact]
    public async Task RefreshAsync_ValidToken_RotatesAndReturnsNewToken()
    {
        var issued = await _sut.CreateRefreshTokenAsync(EmployeeId, TenantSlug, CancellationToken.None);
        var (accessToken, newToken, newExpires) = await _sut.RefreshAsync(issued.Token, CancellationToken.None);

        Assert.False(string.IsNullOrEmpty(accessToken));
        Assert.False(string.IsNullOrEmpty(newToken));
        Assert.NotEqual(issued.Token, newToken); // rotated
        Assert.NotNull(newExpires);
    }

    [Fact]
    public async Task RefreshAsync_DoubleUse_SecondAttemptFails()
    {
        // Atomic rotation regression: consuming the same refresh token twice must yield
        // exactly one success. Sequential is enough; concurrent is covered in store unit tests.
        var issued = await _sut.CreateRefreshTokenAsync(EmployeeId, TenantSlug, CancellationToken.None);

        var first = await _sut.RefreshAsync(issued.Token, CancellationToken.None);
        var second = await _sut.RefreshAsync(issued.Token, CancellationToken.None);

        Assert.NotNull(first.accessToken);
        Assert.Null(second.accessToken);
        Assert.Null(second.newRefreshToken);
    }

    [Fact]
    public async Task GetProfileAsync_ValidEmployee_ReturnsDto()
    {
        var profile = await _sut.GetProfileAsync(EmployeeId, CancellationToken.None);
        Assert.NotNull(profile);
        Assert.Equal(EmployeeId, profile!.Id);
        Assert.Equal(DisplayName, profile.DisplayName);
        Assert.Equal(2, profile.Airports.Count);
    }
}
```

- [ ] **Step 2: Run tests — must pass**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --filter "FullyQualifiedName~AuthenticationServiceTests"
```

Expected: `Passed: 8`. Zero failures.

If `LoginAsync_ValidCredentials_ReturnsResponse` fails citing a column type mismatch (e.g., `Expected INTEGER, got BIGINT`), adjust the `GetInt32`/`GetInt64` calls in `AuthenticationService.MaterializeEmployeeRowsAsync` to match what DuckDB actually produces. The fixture uses `{value}::INTEGER` casts to pin types to INTEGER — if that still doesn't match, check Phase 2's Parquet output column types via `duckdb -c "DESCRIBE SELECT * FROM '...'"` and adjust. This is part of resolving the spec's open item #2 (reader typed-getters).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/PrmDashboard.Tests/AuthService/AuthenticationServiceTests.cs
git commit -m "test(auth): add AuthenticationService integration tests against Parquet fixture"
```

---

### Task 6: Final verification (no commit)

Confirm the whole Phase 3b implementation lands cleanly.

- [ ] **Step 1: Full solution build**

```bash
dotnet build backend/PrmDashboard.sln --nologo
```

Expected: `Build succeeded. 0 Warning(s) 0 Error(s)`.

- [ ] **Step 2: Full test suite**

```bash
dotnet test backend/tests/PrmDashboard.Tests/PrmDashboard.Tests.csproj --nologo --verbosity minimal
```

Expected tally: **83 total tests, 0 failed.** Breakdown:
- 67 pre-existing (43 from before Phase 3 + 24 from Phase 3a)
- 8 InMemoryRefreshTokenStore (Task 1)
- 8 AuthenticationService (Task 5)

- [ ] **Step 3: Confirm AuthService has no MySQL/EF artifacts**

```bash
grep -rE "MySqlConnector|Pomelo|EntityFrameworkCore|MasterDbContext" backend/src/PrmDashboard.AuthService 2>/dev/null || echo "AuthService is clean"
```

Expected: `AuthService is clean`.

- [ ] **Step 4: Confirm no MySQL/EF package churn in other services**

```bash
git diff main..HEAD -- backend/src/PrmDashboard.TenantService backend/src/PrmDashboard.PrmService backend/src/PrmDashboard.Gateway backend/src/PrmDashboard.Shared
```

Expected: empty (Phase 3b touches only AuthService). If anything appears here, it leaked scope — investigate before moving on.

- [ ] **Step 5: Confirm the `Data/` folder is gone**

```bash
ls backend/src/PrmDashboard.AuthService/Data 2>/dev/null && echo "STILL EXISTS — investigate" || echo "Data folder removed"
```

Expected: `Data folder removed`.

- [ ] **Step 6: Confirm the AuthService csproj has zero MySQL/EF references**

```bash
grep -E "MySql|Pomelo|EntityFramework" backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj || echo "csproj is clean"
```

Expected: `csproj is clean`.

- [ ] **Step 7: Report**

This task has no commit. Report the build result, test tally, and verification command outputs so a reviewer can confirm Phase 3b landed cleanly.

---

## Success criteria (recap from spec)

- [x] `PrmDashboard.AuthService.csproj` has no `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, or `MySqlConnector` direct references (verified Task 4 + Task 6 Step 6)
- [x] `backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs` deleted; `Data/` folder gone (verified Task 4 + Task 6 Step 5)
- [x] All four endpoints — `/login`, `/refresh`, `/logout`, `/me` — retain their DTOs, status codes, and cookie semantics (controller is unchanged in shape; tiny call-site adjustments only)
- [x] Atomic refresh rotation preserved: double-use test passes (Task 5)
- [x] Concurrent consume produces exactly one winner: unit test in Task 1 (`TryConsume_RaceBetweenTwoThreads_OnlyOneWins`)
- [x] All pre-existing 67 tests + 16 new tests pass, total 83 (verified Task 6 Step 2)
- [x] No scope leakage into TenantService / PrmService / Shared (verified Task 6 Step 4)

## Open items to resolve during implementation

1. **DuckDB.NET.Data parameter binding syntax** — plan uses `$name` named placeholders. If DuckDB.NET.Data 1.5.0 rejects this form and only accepts positional `?`, adjust the four `cmd.Parameters.Add(new DuckDBParameter("name", value))` call sites to positional adds and change the SQL accordingly. Behavior is functionally identical.
2. **Column type mismatches between fixture and `AuthenticationService`** — if the integration test setup produces different types than expected (e.g., INTEGER vs BIGINT for `id`), adjust the `reader.GetInt32` / `GetInt64` calls in `MaterializeEmployeeRowsAsync`. The fixture uses explicit `::INTEGER` casts to pin types; when Phase 1's real Parquet files are used in Task 6's smoke test, verify the same types come through.
3. **`appsettings.Development.json` `DataPath` value** — the plan uses `"../../../data"` as a dev default (relative from the service's `bin/Debug/net8.0/` output directory). If `dotnet run` from `backend/src/PrmDashboard.AuthService/` fails because of the path, switch to an absolute path or document the correct relative from the running CWD in the README.
