# Performance — PRM Dashboard

## Backend (DuckDB / Parquet)

- **DuckDB is in-process** — there is no network hop, no pool latency, no separate database server. Don't add a cache between DuckDB and the controller "for performance" — the cache will be slower than the query.
- **Reuse `PooledDuckDbSession`** within a request when you need multiple commands. Don't acquire a fresh session per command.
- **Filter pushdown happens at the Parquet layer** — `WHERE airport='DEL'` doesn't read the rows for other airports. Trust the planner.
- **Dedup in the query, not in C#** — the canonical pattern (`ROW_NUMBER … = 1`) lets DuckDB stop after the first row per `id`. Pulling all rows and de-duping in LINQ defeats the planner.
- **Per-tenant Parquet is the partitioning key** — there's no benefit to filtering on `tenant_id` in SQL because the file already is the tenant.
- **Cast aggregates explicitly when they cross the boundary** — `COUNT(*)::INT`, `SUM(CASE…)::INT`, `SUM(integer_arith)::DOUBLE` only when the value feeds `Convert.ToInt32` / `ToDouble`. Inside expressions where the cast would truncate, leave the value alone.

### Hot paths
- **`/api/prm/kpis/summary`** runs three subqueries (current period, previous period, fulfillment). Don't inline these into the same `WITH` — the previous-period bound depends on `from`/`to` so they're naturally separate.
- **`/api/prm/trends/hourly`** builds a 7×24 grid. The `start_time // 100` truncation is the perf-critical line; `CAST(.../100 AS INTEGER)` rounds and silently drops rows.
- **`/api/prm/records`** is paginated (`page`, `size`, `sort`). Always `LIMIT … OFFSET …`.

## Frontend (Angular)

- **Signals are cheaper than RxJS for derived UI state** — prefer `computed()` over `combineLatest`/`map`.
- **`async` pipe or `takeUntilDestroyed()`** on every Observable subscription — avoid manual `.subscribe()` without cleanup (memory leaks + double-renders).
- **Charts** — `BaseChartComponent` debounces resize and skips updates while loading. Don't recreate ECharts options on every frame; memoise via `computed()` where possible.
- **Lazy-load every feature route** via `loadComponent`. Login + Home + Dashboard each ship as a separate chunk.
- **`OnPush` change detection** is the default in Angular 17 with signals — don't reach for `ChangeDetectorRef.detectChanges()`.
- **Filter mutations cascade** — every chart on the dashboard re-fetches when filters change. The current 5-tab dashboard has ~17 charts. Don't add per-chart polling on top.

### Bundle size
- `npx ng build --configuration production` — track bundle size. ECharts is the heaviest dep; treeshake by importing only what we render (`echarts/charts`, `echarts/components`).
- No CSS-in-JS — SCSS compiles ahead-of-time.
- Vendor logos are local PNG/SVG in `public/` (CSP blocks external CDNs).

## Operational
- **Docker image rebuilds** — only the changed service: `docker compose up -d --build prm`. Pinning by sha256 digest means cache hits are reliable.
- **Healthchecks** — gateway `depends_on: service_healthy` keeps it offline until backends are ready, so cold starts don't return 503.
- **Logs**: structured (Serilog) with correlation IDs. Avoid `Information`-level logging inside hot loops; promote per-request summaries to `Information` and per-row details to `Debug`.

## Profile before optimising
Measure with the dev tools' Performance tab and `dotnet-counters` / `dotnet-trace` on the backend before reaching for micro-optimisations. Most "slow" reports trace to one of: missing dedup, `(int)BigInteger` boxing throwing repeatedly, or an N+1 of HTTP calls from the frontend doing one fetch per chart instead of one per tab.
