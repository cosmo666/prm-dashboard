# .NET Backend Conventions

## Project structure

- **Solution:** `backend/PrmDashboard.sln` (legacy `.sln` format, NOT `.slnx` — Dockerfile `COPY` patterns expect the classic extension)
- **One project per microservice** under `backend/src/`:
  - `PrmDashboard.Shared/` — DuckDB abstractions, DTOs, plain data classes (Employee, EmployeeAirport, TenantInfo), TimeHelpers, SerilogBootstrap, common middleware. **No EF entities, no DbContext, no business logic.**
  - `PrmDashboard.AuthService/` — owns login, refresh, logout, /me. Reads employees from `master/employees.parquet`; refresh tokens kept in `InMemoryRefreshTokenStore` (process-local, forgotten on restart — POC compromise).
  - `PrmDashboard.TenantService/` — owns `/config` (public, login-page branding) and `/airports` (RBAC airport list per employee). Reads `master/tenants.parquet` and `master/employee_airports.parquet`. Uses `TenantsLoader : IHostedService` to load the tenant dict once at startup.
  - `PrmDashboard.PrmService/` — owns all 25 dashboard endpoints. Inherits from `BaseQueryService`; queries per-tenant `data/{slug}/prm_services.parquet` files via DuckDB.
  - `PrmDashboard.Gateway/` — Ocelot routing + subdomain → `X-Tenant-Slug` header middleware.
- **Tools** under `backend/tools/`:
  - `PrmDashboard.ParquetBuilder/` — converts CSVs under `data/` into sibling `*.parquet` files via embedded DuckDB. Run after editing any committed CSV seed file.

Each service has its own `Program.cs`, `appsettings.json`, `appsettings.Development.json`, and `Dockerfile`.

## Framework patterns

- **ASP.NET Core 8 minimal hosting** (`WebApplicationBuilder` + `app.MapControllers()`)
- **Controllers thin** — delegate to services. Controllers validate input shape and return DTOs; services own business logic.
- **Dependency injection** — register services in `Program.cs`. Prefer `Scoped` for per-request services, `Singleton` for stateless helpers and the DuckDB pool, `Transient` rarely.
- **Return `ProblemDetails`** for errors via `ExceptionHandlerMiddleware` or `Results.Problem()`.
- **Use `[HttpGet]` / `[HttpPost]` attributes** on controller actions, not minimal endpoints — we want OpenAPI discovery and attribute-based routing.

## DuckDB + Parquet patterns

The runtime data layer uses DuckDB.NET reading directly from Parquet files. There is no ORM. There is no DbContext. There are no migrations.

- **Acquire a session per request:** `await using var session = await _duck.AcquireAsync(ct);` — returns a `PooledDuckDbSession` borrowing a `DuckDBConnection` from the singleton pool. Reuse `session.Connection` for multiple commands within the same handler if you need them.
- **Always parameterise user input:** `cmd.Parameters.Add(new DuckDBParameter("name", value));`. Path literals (the parquet file path) are interpolated directly because they're server-owned via `TenantParquetPaths`, but always pass them through `EscapePath(...)` first to neutralise single quotes.
- **Re-create `DuckDBParameter` per command** — they're stateful and cannot be shared across multiple `DbCommand` instances. Pattern: `foreach (var p in parms) cmd.Parameters.Add(new DuckDBParameter(p.ParameterName, p.Value));`
- **Read scalars with `Convert.ToInt32(reader.GetValue(N))` / `Convert.ToDouble(...)`** — never raw `(int)` / `(long)` casts. DuckDB.NET may return `Int32`, `Int64`, or `BigInteger` from what looks like an int column; `Convert.To*` handles all of them.
- **Cast aggregates explicitly when they feed `Convert.ToInt32`/`ToDouble`:**
  - `COUNT(*)::INT` for counts
  - `SUM(CASE WHEN … THEN 1 ELSE 0 END)::INT` for conditional counts (raw `SUM` returns BigInteger which `Convert.ToInt32` cannot unbox)
  - `SUM(integer_arithmetic)::DOUBLE` when the result feeds `quantile_cont` or `Convert.ToDouble`
  - **Never** put a cast inside `ROUND(100.0 * SUM(...) / total, 2)` — the `100.0` already promotes the expression to DOUBLE, and an `::INT` inside would truncate.
- **Integer division uses `//`** — DuckDB's `/` on integer literals returns DOUBLE. `2359/100` is `23.59`, and `CAST(23.59 AS INTEGER)` rounds to `24`. Use `2359 // 100` (`= 23`) for HHMM truncation. The `HhmmSql.ToMinutes` helper bakes this in.
- **Dedup pattern (canonical):**

  ```sql
  WITH deduped AS (
      SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY row_id) AS rn
          FROM '{path}' WHERE {where}
      ) t WHERE rn = 1
  )
  ```

  The `t` alias on the inner subquery is required by SQL standard. Always include it.
- **Use `BaseQueryService` helpers** instead of rolling your own:
  - `BuildWhereClause(filters)` → `(sqlFragment, IReadOnlyList<DuckDBParameter>)` — composes the full filter predicate.
  - `ResolveTenantParquet(slug)` → escaped path string; throws `TenantParquetNotFoundException` (mapped to 404) if the file is missing.
  - `GroupCountAsync(slug, filters, col, skipNull, limit)` — the dedup + group-count + percentage pattern shared by Breakdown and Ranking services.
  - `DistinctAsync(conn, path, col, where, parms)` / `MinMaxDateAsync(...)` — used by FilterService.
  - `GetPrevPeriodStart(from, to)` — period-over-period bound (use `from.AddDays(-1)` for `prev_end`).
  - `EscapePath(path)` — single-quote escaping for SQL string interpolation.
  - `HhmmSql.ToMinutes(colExpr)` / `HhmmSql.ActiveMinutesExpr(start, paused, end)` — HHMM time arithmetic in SQL.

## Multi-tenant data access

This is the core architectural pattern — every service that touches tenant data must follow it:

1. **Gateway extracts `X-Tenant-Slug` from the subdomain** and adds it as a request header before forwarding to downstream services.
2. **`TenantSlugClaimCheckMiddleware` validates the header** against the JWT `tenant_slug` claim — rejects 400 if missing, 403 if mismatched. Both presence AND match are required for any authenticated request with a `tenant_slug` claim.
3. **`PrmControllerBase.GetTenantSlug()`** reads the header (and throws if empty — defense-in-depth; middleware should already have rejected).
4. **`BaseQueryService.ResolveTenantParquet(slug)`** maps the slug to `data/{slug}/prm_services.parquet`, verifies existence (throws `TenantParquetNotFoundException` → 404 if missing), and returns the SQL-escaped path.
5. **The escaped path is interpolated directly into `FROM '{path}'`** — no connection-string lookup, no inter-service HTTP call.

Key invariants:

- **No hardcoded tenant names anywhere in the code.** Everything flows from the gateway-injected header through the slug → file path mapping.
- **Tenant resolution is a pure string function.** `TenantParquetPaths.TenantPrmServices(slug)` is `Path.Combine(_root, slug, "prm_services.parquet")` — no IO, no cache.
- **Master data goes through `TenantsLoader`** (a startup-loaded `IReadOnlyDictionary<string, TenantInfo>`) for hot lookup paths like `/config`. The dict is loaded once in `StartAsync` from `master/tenants.parquet`; no runtime invalidation.

## Auth & JWT

- **`BCrypt.Net-Next`** for password hashing (work factor 11 default).
- **`System.IdentityModel.Tokens.Jwt`** for token issuance and validation.
- **Startup validation** — every service calls `PrmDashboard.Shared.Extensions.JwtStartupValidator.ReadAndValidate(builder.Configuration, "<svc>")` BEFORE wiring up `AddJwtBearer`. The validator enforces: non-empty `Jwt:Secret`/`Issuer`/`Audience`; minimum 32-byte secret (HS256); rejects the `change-in-production` placeholder shipped in `.env.example` / compose default. Never bypass with `config["Jwt:Secret"]` + a hand-written check — always call the validator.
- **`ClockSkew = TimeSpan.Zero`** on every `TokenValidationParameters`. Default is 5 minutes, which silently extends the documented access-token lifetime by 33%.
- **Access token** — 15 minutes, signed HS256 with secret from `Jwt:Secret` config.
- **Refresh token** — 7 days, kept in `InMemoryRefreshTokenStore` (process-local — restart forgets all sessions). Delivered as httpOnly + Secure + SameSite=Strict cookie scoped to `/api/auth`. **POC compromise; needs a durable store before production.**
- **JWT claims** — `sub` (employee id), `tenant_id`, `tenant_slug`, `name`, `airports` (CSV).
- **Tenant slug format** — validated at `TenantParquetPaths.TenantPrmServices(slug)` via the compiled regex `^[a-z][a-z0-9-]{0,49}$`. Any request whose slug doesn't match hits `ArgumentException` before `Path.Combine`. The gateway/login flow already filter slugs in practice; this is defense-in-depth before filesystem operations.
- **Airport RBAC** — PRM Service `AirportAccessMiddleware` parses `?airport=…` (one code or a CSV like `DEL,BOM`) and validates **every** requested airport against the JWT `airports` claim; 403 on any mismatch. In query logic always use `PrmFilterParams.AirportList` (not the raw `Airport` string) — same contract as `AirlineList` / `ServiceList` / `HandledByList`. `BaseQueryService.BuildWhereClause` handles the single-vs-multi airport branch (single → equality, multi → `IN`).

## Configuration

- **Pattern:** `appsettings.json` (committed, defaults) + `appsettings.Development.json` (committed, dev overrides) + environment variables (deploy-time secrets).
- **Nested config uses double-underscore in env vars:** `Jwt:Secret` → `Jwt__Secret`.
- **Data path lookup order in services:** `PRM_DATA_PATH` env var → `DataPath` config → throw at startup. `DataPathValidator` (hosted service) verifies `{Root}/master/` exists before the app accepts traffic.
- **Never hardcode** secrets, paths, or URLs — always via `IConfiguration` (or `Options<T>` for shape).
- **Fail fast** — validate required config in `Program.cs` at startup; missing values should throw before the service starts accepting requests.

## Logging

- **`ILogger<T>`** via DI — never use `Console.WriteLine` or static loggers.
- **Serilog bootstrap** via `builder.AddPrmSerilog(serviceName: "auth"|"tenant"|"prm")` — sets up structured console output, `CorrelationId` enrichment, and the standard `MinimumLevel.Override` chain.
- **Structured logging** — pass values as template parameters, not string concatenation:

  ```csharp
  _logger.LogInformation("Tenant {Slug} resolved in {ElapsedMs}ms", slug, ms);
  ```

- **Log levels:**
  - `Trace` — verbose, per-row data (never in production)
  - `Debug` — development diagnostics
  - `Information` — startup, configuration, significant state changes
  - `Warning` — recoverable problems
  - `Error` — failures that produce wrong results or 5xx
  - `Critical` — data loss or system-wide failure
- **Never log passwords, tokens, PII, or connection strings.**

## Testing

- **xUnit** for unit and integration tests (not MSTest, not NUnit).
- **Tests live in `backend/tests/PrmDashboard.Tests/`** mirroring the `src/` structure (one folder per service: `AuthService/`, `TenantService/`, `PrmService/`, `Shared/`, etc.).
- **Three test layers:**
  - **Pure unit** — builders that don't need a connection (e.g., `BaseQueryService.BuildWhereClause` golden-string, `JwtStartupValidator.ReadAndValidate`, `TenantParquetPaths.TenantPrmServices` slug validation). Access protected statics via `internal static *ForTest` shims gated by `<InternalsVisibleTo Include="PrmDashboard.Tests" />` in the source csproj.
  - **Service-level integration** — real DuckDB against deterministic Parquet fixtures (`PrmFixtureBuilder` writes a 21-row `prm_services.parquet` to a temp directory; per-test or per-class `IAsyncLifetime` cleans up). NOT mocked.
  - **HTTP-boundary integration** — `WebApplicationFactory<PrmServiceEntryPoint>` for middleware behaviour (TenantSlugClaimCheckMiddleware, AirportAccessMiddleware, ExceptionHandlerMiddleware). Use a namespaced anchor class (`PrmServiceEntryPoint` in `PrmService/TestingEntryPoint.cs`) as the factory's type parameter — NOT the global `Program` class, because multiple projects in the solution define their own and CS0433 would collide. Inject config via `Environment.SetEnvironmentVariable("Jwt__Secret", …)` because the minimal-API entry reads `builder.Configuration` before `ConfigureAppConfiguration` overrides can apply.
- **Assertion library:** plain `Assert.*` — no Fluent Assertions or Shouldly in the POC.
- **Test naming:** `MethodName_Scenario_ExpectedBehavior` (e.g., `GetSummaryAsync_WithDateRange_IncludesPrevPeriod`).
- **Pin exact values where derivable from the fixture** — e.g., `Assert.Equal(10.0, r.AvgPauseDurationMinutes)` is stronger than `Assert.True(r.AvgPauseDurationMinutes > 0)` and catches dedup regressions.
- **Content-type in middleware responses:** use `Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(obj))` with an explicit `Response.ContentType = "application/problem+json"`. NOT `WriteAsJsonAsync(obj)` — it silently overwrites `ContentType` back to `application/json`, breaking RFC 7807 compliance and asserted by the middleware integration tests.

## Anti-patterns to avoid

- ❌ Service locator (`serviceProvider.GetService<T>()` inside business logic) — use constructor injection.
- ❌ Static state for caches (`public static Dictionary<...> _cache`) — register with DI as `Singleton`.
- ❌ `async void` — always `async Task`.
- ❌ `.Result` / `.Wait()` on tasks — always `await`.
- ❌ Sharing a `DuckDBParameter` instance across two commands — re-create it (`new DuckDBParameter(p.Name, p.Value)`).
- ❌ Raw SQL interpolation of caller-supplied values — always use parameters.
- ❌ Swallowing exceptions silently — log and rethrow, or convert to a typed domain exception (`TenantParquetNotFoundException`) that the middleware maps to a status code.
- ❌ Hardcoded tenant names, airport codes, or service types anywhere in the code.
- ❌ EF Core, `DbContext`, `IQueryable`, or `OnModelCreating` anywhere. The runtime data layer is DuckDB over Parquet; there is no ORM in this project.
- ❌ `_paths.TenantPrmServices(slug)` directly in service code — use `ResolveTenantParquet(slug)` from the base class so the existence check (→ 404) and quote-escape happen consistently.

## Dependencies (pinned)

```xml
<!-- Shared / runtime services -->
<PackageReference Include="DuckDB.NET.Data" Version="1.5.0" />
<PackageReference Include="DuckDB.NET.Bindings.Full" Version="1.5.0" />
<PackageReference Include="Microsoft.Extensions.Hosting.Abstractions" Version="10.0.6" />
<PackageReference Include="Microsoft.Extensions.ObjectPool" Version="10.0.6" />
<PackageReference Include="Serilog" Version="4.2.0" />
<PackageReference Include="Serilog.AspNetCore" Version="8.0.3" />

<!-- AuthService / TenantService / PrmService -->
<PackageReference Include="BCrypt.Net-Next" Version="4.0.3" />
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.11" />
<PackageReference Include="System.IdentityModel.Tokens.Jwt" Version="7.6.2" />

<!-- Gateway -->
<PackageReference Include="Ocelot" Version="23.2.0" />
```

Never upgrade major versions without a dedicated task and testing.
