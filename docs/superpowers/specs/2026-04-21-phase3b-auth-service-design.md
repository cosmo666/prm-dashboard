# Phase 3b — AuthService Swap — Design Spec

**Date:** 2026-04-21
**Status:** Approved
**Scope:** Replace the AuthService's EF Core + MySQL data access with DuckDB reads over `master/*.parquet`, and replace the `refresh_tokens` table with an in-memory `ConcurrentDictionary`. External behavior (endpoints, DTOs, status codes, cookie semantics) is unchanged. Depends on Phase 3a foundation primitives.

## Goals

1. AuthService reads employee/tenant/airport data from `master/*.parquet` via the Phase 3a `IDuckDbContext` + `TenantParquetPaths`.
2. Refresh tokens live in a singleton `InMemoryRefreshTokenStore` wrapping `ConcurrentDictionary<string, RefreshTokenEntry>` — no database writes.
3. All four endpoints (`/login`, `/refresh`, `/logout`, `/me`) remain behaviorally identical from the frontend's perspective.
4. Atomic refresh rotation preserved — concurrent refresh requests on the same token must not both succeed.
5. `MySqlConnector`, `Pomelo.EntityFrameworkCore.MySql`, and `Microsoft.EntityFrameworkCore` dropped from `PrmDashboard.AuthService.csproj`.

## Non-goals

- Touching TenantService (Phase 3c) or PrmService (Phase 3d).
- Deleting `Shared/Models/RefreshToken.cs`, `Shared/Models/Employee.RefreshTokens` navigation, or the old `Shared/Models/Tenant.cs` — other services still reference these.
- Introducing a shared `TenantLookup` helper — that's Phase 3c's concern; AuthService does its own inline tenant query for now.
- Changing the frontend, rate-limiting config, JWT key/issuer/audience settings, CORS, middleware, or Serilog setup.
- Updating `LastLogin` via writes (Parquet is read-only from the runtime; audit moves to Serilog events).
- Rewriting seed passwords from `BCRYPT_PENDING:` to real bcrypt hashes — `BCRYPT_PENDING` verification still works; the self-upgrade-on-first-login path is dropped.

## Target architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│  AuthController (unchanged)                                          │
│    POST /login, /refresh, /logout   GET /me                          │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ injects
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AuthenticationService (rewritten)                                   │
│                                                                      │
│    ctor(IDuckDbContext duck, TenantParquetPaths paths,               │
│         InMemoryRefreshTokenStore tokens, JwtService jwt, ...)       │
│                                                                      │
│    LoginAsync(slug, req):                                            │
│      1. tenant = SELECT id, slug, is_active FROM '{paths.MasterTenants}'
│                   WHERE slug = @slug AND is_active                   │
│      2. employee+airports = SELECT e.*, ea.airport_code, ea.airport_name
│                   FROM '{paths.MasterEmployees}' e                   │
│                   LEFT JOIN '{paths.MasterEmployeeAirports}' ea      │
│                     ON e.id = ea.employee_id                         │
│                   WHERE e.tenant_id = @tid AND e.username = @u       │
│                     AND e.is_active                                  │
│      3. bcrypt verify (with BCRYPT_PENDING: back-compat)             │
│      4. log structured AuthEvent (replaces last_login DB write)      │
│      5. issue JWT via JwtService                                     │
│      6. return LoginResponse                                         │
│                                                                      │
│    RefreshAsync(token):                                              │
│      1. tokens.TryConsume(token) → atomic remove+return entry         │
│      2. reload employee+airports + tenant from Parquet               │
│      3. issue new JWT + new refresh token                            │
│                                                                      │
│    RevokeAsync(token):                                               │
│      1. tokens.Revoke(token) → TryRemove, ignore result              │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
       ┌───────────┴──────────────────────┐
       ▼                                  ▼
┌────────────────────────┐   ┌───────────────────────────────────────┐
│  IDuckDbContext (3a)   │   │  InMemoryRefreshTokenStore (new)      │
│  pool of in-memory     │   │  ConcurrentDictionary<string,         │
│  DuckDBConnection      │   │    RefreshTokenEntry>                 │
│  reading .parquet      │   │  Add, TryConsume, Revoke              │
└────────────────────────┘   └───────────────────────────────────────┘
```

## Decisions

| Decision | Value | Why |
|---|---|---|
| Employee lookup | Single DuckDB query with `LEFT JOIN` across `employees.parquet` and `employee_airports.parquet` | DuckDB joins Parquet natively; one round-trip for employee + all their airports. |
| Tenant lookup | Inline DuckDB SELECT against `tenants.parquet` in `AuthenticationService` | Small query, two call sites (login + refresh reload). 3c will extract a shared helper; minimal duplication until then. |
| Refresh token store | `InMemoryRefreshTokenStore` singleton wrapping `ConcurrentDictionary<string, RefreshTokenEntry>` | Spec-mandated. `ConcurrentDictionary.TryRemove` is atomic — replaces the SQL `UPDATE ... WHERE` race-safe pattern. |
| `RefreshTokenEntry` shape | `sealed record RefreshTokenEntry(int EmployeeId, string TenantSlug, DateTime ExpiresAt)` | Only what's needed to reissue a JWT on refresh. Employee details (name, email, airports) re-read from Parquet on refresh — no staleness. |
| Atomic rotation | `store.TryConsume(token)` = `TryRemove(token, out var entry) && entry.ExpiresAt > UtcNow` | Atomic within a single process. One winner, one loser under concurrent refresh. |
| Expired-entry cleanup | None (YAGNI at POC scale) — entries accumulate until process restart | Hundreds of entries/day at POC scale. Restart clears. Add a background sweeper later if memory grows. |
| `LastLogin` | Replaced with `_logger.LogInformation("AuthEvent login employee={Id} tenant={Slug} at {Ts}")` | Parquet is read-only. Audit trail moves to structured logs. |
| `BCRYPT_PENDING:` path | Keep the plaintext-match branch for back-compat; drop the "rewrite hash on first login" path; log a one-off warning on each verify | Can't write to Parquet at runtime. Seeds will be regenerated with real bcrypt during the Phase 4 cleanup. |
| `TenantInfo` vs `Tenant` | AuthService uses `TenantInfo` (the Phase 3a record) for its own internal state | Old `Tenant` EF entity stays alive for TenantService/PrmService until their phases finish. |
| Startup wiring | Replace `AddDbContext<MasterDbContext>` + `MasterDb` conn string with `Configure<DataPathOptions>` + `AddHostedService<DataPathValidator>` + `AddSingleton<IDuckDbContext>` + `AddSingleton<TenantParquetPaths>` + `AddSingleton<InMemoryRefreshTokenStore>` | Per Phase 3a spec's "Startup wiring (for reference, implemented in 3b/3c/3d)" section. First service to implement it. |
| Package removal | Delete `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.EntityFrameworkCore`, `MySqlConnector` from `PrmDashboard.AuthService.csproj` | Forces compile-time verification that no code path depends on MySQL/EF. |
| `Data/MasterDbContext.cs` | Delete | Dead after the rewrite. Its `DbSet<RefreshToken>` is replaced by the in-memory store; `DbSet<Tenant>`/`<Employee>`/`<EmployeeAirport>` replaced by DuckDB queries. |
| `Shared/Models/RefreshToken.cs` | Keep untouched | Still referenced by `Employee.RefreshTokens` nav prop, which other services' `MasterDbContext` classes see. Deferred to 3d cleanup. |
| Rate limiter, CORS, JWT, middleware, controllers | Untouched | Orthogonal to data-access changes. |

## File structure

Modified:

- `backend/src/PrmDashboard.AuthService/Services/AuthenticationService.cs` — major rewrite; all methods now use `IDuckDbContext` + `InMemoryRefreshTokenStore`
- `backend/src/PrmDashboard.AuthService/Program.cs` — swap DI wiring (EF → DuckDB primitives + refresh store)
- `backend/src/PrmDashboard.AuthService/PrmDashboard.AuthService.csproj` — remove 3 packages, add nothing (foundation brings DuckDB via Shared)
- `backend/src/PrmDashboard.AuthService/appsettings.Development.json` — replace `ConnectionStrings:MasterDb` with `DataPath`

Created:

- `backend/src/PrmDashboard.AuthService/Services/InMemoryRefreshTokenStore.cs` — the dict wrapper + `RefreshTokenEntry` record (~50 LOC)

Deleted:

- `backend/src/PrmDashboard.AuthService/Data/MasterDbContext.cs` (and the empty `Data/` folder once it's gone)

Unchanged:

- `backend/src/PrmDashboard.AuthService/Controllers/AuthController.cs`
- `backend/src/PrmDashboard.AuthService/Services/JwtService.cs`
- Rate limiter config, CORS, Serilog wiring, middleware registration

## Components

### `InMemoryRefreshTokenStore`

```csharp
public sealed record RefreshTokenEntry(int EmployeeId, string TenantSlug, DateTime ExpiresAt);

public sealed class InMemoryRefreshTokenStore
{
    private readonly ConcurrentDictionary<string, RefreshTokenEntry> _tokens = new();

    public void Add(string token, RefreshTokenEntry entry);
    public bool TryConsume(string token, out RefreshTokenEntry entry);  // atomic remove + validity check
    public void Revoke(string token);  // TryRemove, ignore result
}
```

- Singleton DI registration.
- `TryConsume` is the atomic-rotation primitive: `TryRemove` + check `entry.ExpiresAt > DateTime.UtcNow`. If remove succeeds but entry has expired, return `false` and the entry is still gone (that's fine — expired tokens should be purged).
- `Add` uses `TryAdd` under the hood but since tokens are cryptographically random 256-bit strings, collisions are effectively impossible; if `TryAdd` returns false we throw (a bug, not an expected state).
- Process restart drops all tokens — that's the POC-accepted compromise.

### `AuthenticationService` rewrite

Public API (two methods change signature; rest unchanged):

```csharp
Task<LoginResponse?> LoginAsync(string tenantSlug, LoginRequest request, CancellationToken ct);
Task<RefreshTokenIssued> CreateRefreshTokenAsync(int employeeId, string tenantSlug, CancellationToken ct);
Task<(string? accessToken, string? newRefreshToken, DateTime? newExpiresAt)> RefreshAsync(string token, CancellationToken ct);
Task RevokeRefreshTokenAsync(string token, CancellationToken ct);
Task<EmployeeDto?> GetProfileAsync(int employeeId, CancellationToken ct);
```

Two signature changes from today:

1. `CreateRefreshTokenAsync` — gains `tenantSlug` parameter; returns a new small `sealed record RefreshTokenIssued(string Token, DateTime ExpiresAt)` (wire-shape) instead of the `RefreshToken` EF entity. The store's `RefreshTokenEntry(EmployeeId, TenantSlug, ExpiresAt)` stays internal and does not cross the service boundary.
2. `RefreshAsync` — returns a 3-tuple `(accessToken, newRefreshToken, newExpiresAt)` of plain types (all nullable) instead of the current 2-tuple with an EF entity.

Both changes flow into tiny controller adjustments (one line each).

### `AuthController` adjustments

Minimal. The current controller does:

```csharp
var refreshToken = await _authService.CreateRefreshTokenAsync(result.Employee.Id, ct);
SetRefreshTokenCookie(refreshToken.Token, refreshToken.ExpiresAt);
```

Changes to:

```csharp
var refresh = await _authService.CreateRefreshTokenAsync(result.Employee.Id, tenantSlug, ct);
SetRefreshTokenCookie(refresh.Token, refresh.ExpiresAt);
```

Where the return type becomes a small `record RefreshTokenIssued(string Token, DateTime ExpiresAt)` (not the spec's `RefreshTokenEntry` — separating wire-facing from internal state).

Similarly, `Refresh` already destructures the tuple returned by `RefreshAsync`; the new tuple shape slots in cleanly.

### SQL queries (as literals in `AuthenticationService`)

```sql
-- Tenant lookup
SELECT id, name, slug, is_active, created_at, logo_url, primary_color
FROM '{paths.MasterTenants}'
WHERE slug = ? AND is_active
LIMIT 1;

-- Employee + airports (one row per airport; group in C#)
SELECT e.id, e.tenant_id, e.username, e.password_hash, e.display_name, e.email,
       e.is_active, e.created_at, e.last_login,
       ea.airport_code, ea.airport_name
FROM '{paths.MasterEmployees}' e
LEFT JOIN '{paths.MasterEmployeeAirports}' ea ON ea.employee_id = e.id
WHERE e.tenant_id = ? AND e.username = ? AND e.is_active
ORDER BY e.id, ea.airport_code;

-- Profile lookup (by employee id)
SELECT e.id, e.display_name, e.email,
       ea.airport_code, ea.airport_name
FROM '{paths.MasterEmployees}' e
LEFT JOIN '{paths.MasterEmployeeAirports}' ea ON ea.employee_id = e.id
WHERE e.id = ? AND e.is_active
ORDER BY e.id, ea.airport_code;
```

Parameterization uses positional `?` placeholders, bound via `DuckDBCommand.Parameters.Add(new DuckDBParameter { Value = ... })`. SQL injection risk stays the same as today — parameters, not string concat, for user-supplied values. Path literals are built from `TenantParquetPaths` outputs (trusted), escaped via single-quote doubling in case a path ever contains apostrophes (defensive — filesystem paths in this project never do).

### Startup wiring in `Program.cs`

Removed:

```csharp
var connStr = builder.Configuration.GetConnectionString("MasterDb")
    ?? throw new InvalidOperationException("ConnectionStrings:MasterDb is required");
builder.Services.AddDbContext<MasterDbContext>(opt =>
    opt.UseMySql(connStr, new MySqlServerVersion(new Version(8, 0, 36))));
```

Added:

```csharp
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
```

`AddScoped<AuthenticationService>()` stays (it's still scoped because it has per-request state via the DuckDB session lifetime pattern — though in practice the session is acquired inside each method, so `Scoped` vs `Singleton` is a judgment call; keep `Scoped` for consistency with the existing registration).

## Testing strategy

All tests live in the existing `PrmDashboard.Tests` project under a new `AuthService/` folder.

### `InMemoryRefreshTokenStoreTests.cs`

Pure unit tests, no DuckDB dependency. ~6 tests:

- `Add_NewToken_CanBeConsumed`
- `Add_DuplicateToken_Throws` (defensive — shouldn't happen in practice)
- `TryConsume_ValidToken_ReturnsEntryAndRemoves`
- `TryConsume_ExpiredToken_ReturnsFalseAndRemoves`
- `TryConsume_UnknownToken_ReturnsFalse`
- `TryConsume_RaceBetweenTwoThreads_OnlyOneWins` (spins up two tasks calling `TryConsume` on the same token; asserts exactly one gets the entry)
- `Revoke_KnownToken_Removes`
- `Revoke_UnknownToken_Ignored`

Closer to 8 tests — worth the thoroughness since this is the atomic-rotation primitive.

### `AuthenticationServiceTests.cs`

Integration tests using `IAsyncLifetime` to build a real Parquet fixture (tenants, employees, employee_airports) at test setup, same pattern as Phase 3a's `DuckDbContextTests`. ~6 tests:

- `LoginAsync_ValidCredentials_ReturnsResponse`
- `LoginAsync_UnknownTenant_ReturnsNull`
- `LoginAsync_UnknownUser_ReturnsNull`
- `LoginAsync_WrongPassword_ReturnsNull`
- `LoginAsync_BcryptPendingPrefix_VerifiesViaPlaintext`
- `RefreshAsync_ValidToken_RotatesAndReturnsNewToken`
- `RefreshAsync_DoubleUse_SecondAttemptFails` (atomic rotation test — consume same token twice, second returns null)
- `GetProfileAsync_ValidEmployee_ReturnsDto`

~8 tests. Total new tests for 3b: ~16.

## Success criteria

1. `grep -E "MySqlConnector|Pomelo|EntityFramework" backend/src/PrmDashboard.AuthService/` returns zero matches.
2. `PrmDashboard.AuthService.csproj` has zero of the three removed packages.
3. `Data/MasterDbContext.cs` is deleted; `Data/` folder is gone.
4. Solution builds 0/0; tests grow from 67 → ~83 (exact count pinned in plan).
5. `docker compose up auth mysql` boots the AuthService pointed at `/data` (env var), login succeeds against the seeded Parquet.
6. Concurrent refresh requests on the same token: exactly one succeeds (verified by unit test).
7. Frontend works end-to-end against the swapped AuthService with no changes.

## Open items to resolve during implementation planning

1. Does `DuckDBCommand` use `@name` or `?` for positional parameters? The canonical DuckDB.NET docs show `?` placeholders. Confirmed at implementation time; test harness will surface issues.
2. How does `DuckDBDataReader` surface `VARCHAR` vs `TEXT` column types — should we use `GetString(i)` or `GetValue(i)`? The spec in Phase 3a's tests used `GetValue` with `Convert.ToInt64`; for strings, `GetString` is direct. Confirmed at implementation.
3. Does the `AuthController.Login` need any adjustment beyond the one-line tuple destructuring? Most likely no, but verify during the rewrite.
