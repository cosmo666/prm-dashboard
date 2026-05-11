# Development Workflow — PRM Dashboard

## Research first
Before coding any non-trivial feature:

1. **Read the relevant rule file** for the layer you're touching:
   - Backend → `.claude/rules/dotnet-backend.md`
   - `frontend/**` (Angular 17, port 4200) → `.claude/rules/angular-frontend.md`
   - `frontend-v8/**` (Angular 8 + PrimeNG, port 4300) → `.claude/rules/angular-v8-frontend.md`
   - Anything touching `prm_services` data → invoke the `prm-domain` skill
2. **Skim CLAUDE.md → Architecture decisions table** to avoid contradicting prior choices.
3. **Look for existing helpers** — `BaseQueryService.BuildWhereClause` / `ResolveTenantParquet` / `GroupCountAsync`, `HhmmSql`, the chart wrappers, `FilterStore` mutators.
4. Only then start implementing.

## Implementation order

### New PRM analytics endpoint
1. Add the DTO `record` to the appropriate file under `Shared/DTOs/`.
2. Add the query method to a service under `PrmService/Services/` (or extend an existing one). Inherit from `BaseQueryService`.
3. Wire the endpoint in the relevant controller; `?airport=` param sits behind `AirportAccessMiddleware` automatically.
4. Add a fixture-backed xUnit test using `PrmFixtureBuilder` — pin exact values from the deterministic 21-row parquet.
5. Update `PrmDataService` (frontend) with a typed method.
6. Surface the data in the relevant dashboard tab — wrap any new chart type in `shared/charts/`.

### New filter dimension
1. Add the property to `PrmFilterParams`.
2. Add the clause to `BaseQueryService.BuildWhereClause` (single source of truth — every endpoint inherits it).
3. Add a fixture test that exercises both single and CSV-multi inputs (`?airline=AI` vs `?airline=AI,UK`).
4. Add a `set/toggle` mutator to `FilterStore`.
5. Wire the UI in `filter-bar/`.

### New tenant
Follow the README's "Onboarding a new tenant" flow:
1. Append rows to `data/master/tenants.csv`, `employees.csv`, `employee_airports.csv`.
2. Create `data/{slug}/prm_services.csv`.
3. Run `dotnet run --project backend/tools/PrmDashboard.ParquetBuilder -- --dir ./data`.
4. `docker compose restart auth tenant` (prm picks the path up lazily per request).

## Pre-commit checklist (self-review)

### Backend
- [ ] No raw `HttpClient` / `(int)` casts on aggregates / `_paths.TenantPrmServices` direct usage / `WriteAsJsonAsync` for ProblemDetails
- [ ] `await using` for `PooledDuckDbSession`
- [ ] Each `DuckDBParameter` re-created per command (not shared across two commands)
- [ ] `dotnet build` clean (0 warnings)
- [ ] `dotnet test` passes (all 172+ tests)

### Frontend
- [ ] Standalone components only (no NgModules)
- [ ] `ApiClient` for HTTP (no direct `HttpClient`)
- [ ] Charts wrap `BaseChartComponent`
- [ ] `[appTooltip]` (not `matTooltip`)
- [ ] No `any` types (intentional `eslint-disable` for ECharts handlers OK)
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm test` passes
- [ ] `npx ng build --configuration production` succeeds

### Both
- [ ] No console / debug statements left in
- [ ] No hardcoded tenant slugs, airport codes, or non-IATA service codes
- [ ] Dark mode works (toggle and verify)
- [ ] Git diff is clean — no unintended changes

## When stuck
1. Re-read the error carefully — DuckDB error messages are unusually precise.
2. Check the docker logs of the failing service (`docker compose logs -f prm`).
3. If a query returns wrong numbers, write a fixture-backed test that pins the expected value first, then debug from there.
4. If the dev loop is slow, rebuild only the changed container (`docker compose up -d --build prm`).
5. If Claude is going in circles, start a fresh session with a clear problem statement that includes the failing input/output.

## Architecture decisions
Any non-trivial decision (new pattern, schema change, security tradeoff, dependency upgrade) gets a dated row in CLAUDE.md → "Architecture decisions" table. Keep the row to one line if you can; longer rationale stays in the PR description.
