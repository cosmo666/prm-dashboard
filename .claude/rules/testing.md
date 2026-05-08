# Testing — PRM Dashboard

## Current state
- **Backend**: 172/172 xUnit tests passing — unit + DuckDB-fixture-backed + `WebApplicationFactory` middleware integration.
- **Frontend**: 1/1 Karma + Jasmine sanity test, ESLint clean (0 errors, 28 intentional `no-explicit-any` warnings on ECharts handlers).
- See `docs/e2e-checklist.md` for manual verification scenarios.

## Backend test layers

### 1. Pure unit
For builders and helpers that don't need a connection. Examples:
- `BaseQueryService.BuildWhereClause` golden-string assertions
- `JwtStartupValidator.ReadAndValidate` config-error cases
- `TenantParquetPaths.TenantPrmServices` slug-validation regex (22 cases)
- `HhmmSql` time-arithmetic edge cases

Access protected statics via `internal static *ForTest` shims gated by `<InternalsVisibleTo Include="PrmDashboard.Tests" />` in the source csproj.

### 2. Service-level integration (DuckDB-fixture-backed)
Real DuckDB against deterministic Parquet fixtures.

- `PrmFixtureBuilder` writes a 21-row `prm_services.parquet` to a temp directory.
- Per-test or per-class `IAsyncLifetime` cleans up.
- **Pin exact values from the fixture** (`Assert.Equal(10.0, r.AvgPauseDurationMinutes)`) — `Assert.True(... > 0)` is too weak and misses dedup regressions.
- These tests are **not mocked** and they're the most valuable layer in the suite.

### 3. HTTP-boundary integration (`WebApplicationFactory`)
For middleware behaviour at the HTTP layer.

- Use `WebApplicationFactory<PrmServiceEntryPoint>` — the namespaced anchor class lives in `PrmService/TestingEntryPoint.cs`.
- **Don't use the global `Program` class** — multiple projects in the solution define their own and CS0433 would collide.
- Inject config via `Environment.SetEnvironmentVariable("Jwt__Secret", …)` — the minimal-API entry reads `builder.Configuration` before `ConfigureAppConfiguration` overrides can apply.
- Eight tests cover 401/400/403/404/200 across `TenantSlugClaimCheckMiddleware`, `AirportAccessMiddleware`, `ExceptionHandlerMiddleware`.

## Conventions
- **Framework**: xUnit. Plain `Assert.*` — no Fluent Assertions / Shouldly.
- **Naming**: `MethodName_Scenario_ExpectedBehavior` (e.g., `GetSummaryAsync_WithDateRange_IncludesPrevPeriod`).
- **Layout**: `backend/tests/PrmDashboard.Tests/` mirrors `backend/src/` (one folder per service: `AuthService/`, `TenantService/`, `PrmService/`, `Shared/`).
- **Fixture discipline**: every regression-driven test names the row(s) in the fixture it depends on (e.g., "fixture row with `start_time=2359`" pins the heatmap-boundary regression).
- **What to test** — anything in the SQL layer, anything in middleware, every new endpoint at the service level. Don't test thin controller pass-throughs.

## When to add what
| Change | Required tests |
|---|---|
| New filter dimension in `BuildWhereClause` | Unit golden-string + at least one fixture test exercising single + CSV-multi |
| New PRM endpoint | Fixture-backed service test pinning exact values |
| Middleware change | `WebApplicationFactory` integration test |
| Regression fix | A test that pins the old buggy input/output combination |
| HHMM / dedup change | Fixture test with edge-case rows (paused-not-resumed, `start_time=2359`, duplicate `id`) |

## Frontend tests
- Karma + Jasmine; tests next to code (`foo.component.spec.ts` beside `foo.component.ts`).
- `npm test` runs headless.
- The current sanity test is intentional — until charts/state stabilise, full component-level testing is out of scope. Add tests opportunistically for pure utility code (`compact-number.pipe`, `date-presets`, `annotations`).

## Build verification
- `dotnet build` — 0 errors, 0 warnings.
- `dotnet test` — green.
- `npm run lint` — 0 errors.
- `npx ng build --configuration production` — succeeds, no warnings ignored.

## Anti-patterns
- ❌ Mocking DuckDB. Use fixtures — they're cheap and catch real bugs.
- ❌ `Assert.True(value > 0)` when `Assert.Equal(<exact>, value)` is computable from the fixture.
- ❌ Global `Program` class as `WebApplicationFactory` type parameter (CS0433 with multi-project solutions).
- ❌ Hand-rolled HTTP client tests when `WebApplicationFactory` exists.
- ❌ Test methods named `Test1`, `Test2`, `ItShouldWork`.
