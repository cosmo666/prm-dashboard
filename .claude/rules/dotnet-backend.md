# .NET Backend Conventions

## Project structure

- **Solution:** `backend/PrmDashboard.sln` (legacy `.sln` format, NOT `.slnx` — Dockerfile `COPY` patterns expect the classic extension)
- **One project per microservice** under `backend/src/`:
  - `PrmDashboard.Shared/` — entities, DTOs, pure helpers (no business logic)
  - `PrmDashboard.AuthService/` — owns login, refresh, logout, /me
  - `PrmDashboard.TenantService/` — owns tenant resolution + `SchemaMigrator`
  - `PrmDashboard.PrmService/` — owns all 19 dashboard endpoints
  - `PrmDashboard.Gateway/` — Ocelot routing + subdomain middleware

Each service has its own `Program.cs`, `appsettings.json`, `appsettings.Development.json`, and `Dockerfile`.

## Framework patterns

- **ASP.NET Core 8 minimal hosting** (`WebApplicationBuilder` + `app.MapControllers()`)
- **Controllers thin** — delegate to services. Controllers validate input shape and return DTOs; services own business logic
- **Dependency injection** — register services in `Program.cs`. Prefer `Scoped` for DB-touching services, `Singleton` for caches and stateless helpers, `Transient` rarely
- **Return `ProblemDetails`** for errors via `Results.Problem()` or `[ProducesResponseType]`
- **Use `[HttpGet]` / `[HttpPost]` attributes** on controller actions, not minimal endpoints — we want OpenAPI discovery and attribute-based routing

## EF Core patterns

- **EF Core 8 with Pomelo MySQL provider** (`Pomelo.EntityFrameworkCore.MySql` 8.0.2)
- **Use modern style:** `dbContext.Tenants.Where(...).ToListAsync()`, NOT legacy `Query<T>()`
- **AsNoTracking() for read-only queries** — cheaper, no change-tracking overhead
- **Include() sparingly** — prefer projections to DTOs with `Select()` when you only need specific fields
- **Never leak IQueryable across service boundaries** — materialize with `ToListAsync()` / `FirstOrDefaultAsync()` before returning
- **Migrations live in `Schema/Migrations/` as embedded SQL files** (PRM-specific pattern — see multi-tenant section)

## MySqlConnector for raw SQL

- **Use `MySqlConnector` 2.3.7** (the underlying driver Pomelo sits on) when you need raw SQL — specifically:
  - `SchemaMigrator` in TenantService
  - Dashboard aggregation queries in PrmService where EF LINQ is clunky (e.g., window functions, percentiles)
- **Always parameterize** — never string-concatenate user input into SQL
- **Dispose properly** — `await using var conn = new MySqlConnection(cs);` and `await using var cmd = ...`
- **Use transactions for multi-statement writes** (see `SchemaMigrator.RunAsync()` for the pattern)

## Multi-tenant database access

This is the core architectural pattern — every service that touches tenant data must follow it:

1. **Gateway extracts `X-Tenant-Slug` from the subdomain** and adds it as a request header before forwarding to downstream services
2. **Services call `TenantService.ResolveAsync(slug)`** which returns a `Tenant` entity with decrypted connection string
3. **`SchemaMigrator.RunAsync(connectionString)` is invoked on cache miss** before the connection is returned, ensuring the tenant DB has all required schema
4. **The resolved connection string is used as a scoped `DbContext`** or raw `MySqlConnection` for the duration of the request
5. **Tenant connections are cached in-memory for 5 minutes** — subsequent requests skip the resolution round-trip but the cache is not shared across replicas

Key invariant: **no hardcoded tenant names anywhere in the code**. Everything flows through the slug → tenant entity → connection string chain.

## Migration files

Location: `backend/src/PrmDashboard.TenantService/Schema/Migrations/*.sql`

Naming: `NNN_snake_case_description.sql` where `NNN` is zero-padded ordinal (e.g., `001_create_prm_services.sql`, `002_add_cost_center.sql`).

Rules:

1. **Never edit a committed migration file.** Applied migrations are immutable facts in each tenant's `schema_migrations` tracker table
2. **Never delete a migration file** — same reason
3. **Always add a new file** for a new schema change
4. **Idempotent DDL** — use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` (MySQL 8.0.29+), or guard with `INFORMATION_SCHEMA` checks
5. **Embedded as resources** — each file must be listed in the `.csproj` as `<EmbeddedResource>` so the runner reads them via `Assembly.GetManifestResourceStream`
6. **Transactional** — the runner wraps each migration in a transaction; if the DDL fails the tracker row is not inserted and the migration retries on next request

## Auth & JWT

- **`BCrypt.Net-Next`** for password hashing (work factor 11 default)
- **`System.IdentityModel.Tokens.Jwt`** for token issuance and validation
- **Access token** — 15 minutes, signed HS256 with secret from `Jwt:Secret` config
- **Refresh token** — 7 days, stored as raw token in `refresh_tokens` table (POC compromise — production should hash via SHA-256), delivered as httpOnly + Secure + SameSite=Strict cookie scoped to `/api/auth`
- **JWT claims** — `sub` (employee id), `tenant_id`, `tenant_slug`, `name`, `airports` (list)
- **Airport RBAC** — PRM Service middleware parses `?airport=…` (accepts one code or a CSV like `DEL,BOM`) and validates **every** requested airport against the JWT `airports` claim; 403 on any mismatch. In query logic use `PrmFilterParams.AirportList` (not the raw `Airport` string) — same contract as `AirlineList`/`ServiceList`/`HandledByList`; `BaseQueryService.ApplyFilters` handles the single vs. multi-airport branch

## Configuration

- **Pattern:** `appsettings.json` (committed, defaults) + `appsettings.Development.json` (committed, dev overrides) + environment variables (deploy-time secrets)
- **Nested config uses double-underscore in env vars:** `Jwt:Secret` → `Jwt__Secret`
- **Never hardcode** connection strings, secrets, or URLs — always via `IConfiguration`
- **Fail fast** — validate required config in `Program.cs` at startup; missing values should throw before the service starts accepting requests

## Logging

- **`ILogger<T>`** via DI — never use `Console.WriteLine` or static loggers
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
- **Never log passwords, tokens, PII, or connection strings**

## Testing

- **xUnit** for unit tests (not MSTest, not NUnit)
- **Tests live in `backend/tests/`** mirroring the `src/` structure
- **Integration tests hit a real MySQL** via Testcontainers or a dedicated test database — NOT mocked
- **`WebApplicationFactory<TEntryPoint>`** for integration tests against the full pipeline
- **Assertion library:** use plain `Assert.*` — no Fluent Assertions or Shouldly in the POC (keep dependencies minimal)
- **Test naming:** `MethodName_Scenario_ExpectedBehavior` (e.g., `ResolveAsync_UnknownSlug_ReturnsNull`)

## Anti-patterns to avoid

- ❌ Service locator (`serviceProvider.GetService<T>()` inside business logic) — use constructor injection
- ❌ Static state (`public static Dictionary<...> _cache`) — use `IMemoryCache` or `IDistributedCache`
- ❌ `async void` — always `async Task`
- ❌ `.Result` / `.Wait()` on tasks — always `await`
- ❌ Leaking `DbContext` instances across requests — they are not thread-safe
- ❌ Raw SQL interpolation — always use parameters
- ❌ Swallowing exceptions silently — log and rethrow or wrap in a domain exception
- ❌ Hardcoded tenant names, airport codes, or service types anywhere in the code

## Dependencies (pinned)

```xml
<PackageReference Include="Pomelo.EntityFrameworkCore.MySql" Version="8.0.2" />
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.11" />
<PackageReference Include="MySqlConnector" Version="2.3.7" />
<PackageReference Include="BCrypt.Net-Next" Version="4.0.3" />
<PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="8.0.11" />
<PackageReference Include="System.IdentityModel.Tokens.Jwt" Version="7.6.2" />
<PackageReference Include="Ocelot" Version="23.2.0" />
```

Never upgrade major versions without a dedicated task and testing.
