# E2E Manual-Verification Checklist

Manual QA scenarios for the PRM Dashboard. Walk this after any change that touches auth, tenant routing, RBAC, filtering, or chart rendering — automated tests cover the SQL / middleware layers but not the click-through.

**Cover both frontends.** Repeat every scenario on Angular 17 (`:4200`) and Angular 8 + PrimeNG (`:4300`) — same backend, different UI stacks, both must work.

## Prep

```bash
docker compose up -d --build
# Wait for healthchecks
docker compose ps                                        # all six containers "(healthy)"
```

Tenants seeded:

| Slug | Login | Password | Airports |
| --- | --- | --- | --- |
| `aeroground` | `admin@aeroground.com` | see `data/master/employees.csv` | DEL, BOM, BLR |
| `skyserve` | `admin@skyserve.com` | see `data/master/employees.csv` | HYD, MAA |
| `globalprm` | `admin@globalprm.com` | see `data/master/employees.csv` | DEL, BOM, HYD, MAA, BLR, CCU |

Resolve subdomains by adding `aeroground.localhost`, `skyserve.localhost`, `globalprm.localhost` to `/etc/hosts` (or Windows `C:\Windows\System32\drivers\etc\hosts`) → `127.0.0.1`.

## Auth

- [ ] **Login (golden path)** — `http://aeroground.localhost:4200/login` → submit valid credentials → lands on `/home` with tenant logo + name visible in the top bar.
- [ ] **Login — bad password** — invalid credentials show an inline "Invalid username or password" message; no redirect, no console errors, no token in `localStorage`.
- [ ] **Logout** — Click logout → redirected to `/login`. Reload `/home` → bounced back to `/login` (refresh cookie is revoked, not just cleared client-side).
- [ ] **Silent refresh** — After 15+ minutes idle, click any chart filter → request succeeds (interceptor refreshed the token transparently). Verify in DevTools network tab: failed 401 followed by `/auth/refresh` 200 followed by retried request 200.
- [ ] **Rate limit** — Submit 6 failed logins from the same IP in under a minute → 6th returns `429 Too Many Requests` with `application/problem+json`.

## Tenant isolation

- [ ] **Subdomain → tenant** — Logged into `aeroground.localhost:4200`, the top bar shows the AeroGround logo + primary colour. Switch to `skyserve.localhost:4200` → SkyServe branding, completely different data.
- [ ] **Cross-tenant token replay (defence)** — Take the access token from an AeroGround session, hit `http://skyserve.localhost:4200/api/prm/kpis/summary` with it directly via curl → 403 (the `tenant_slug` claim mismatches the gateway-injected `X-Tenant-Slug` header).
- [ ] **Missing tenant data** — Browse to a tenant whose Parquet hasn't been generated → 404 with a clean error page, not a 500 stack trace.

## Airport RBAC

- [ ] **Selector is JWT-scoped** — An employee with `airports: ["DEL", "BOM"]` sees only DEL and BOM in the airport selector. HYD never appears.
- [ ] **Cannot deselect last airport** — Deselect every checkbox in the airport selector → the most-recently-deselected airport snaps back. Dashboard always has at least one airport in scope.
- [ ] **Server-side enforcement** — Manually craft a request to `/api/prm/kpis/summary?airport=DEL,HYD` for an employee scoped only to DEL/BOM → 403 (`AirportAccessMiddleware`).

## Filters

- [ ] **Multi-select airline / service / handled-by** — Pick two of each → URL becomes `?airline=AI,UK&service=WCHR,WCHC&handled_by=…` → reload → filters restored from URL → all charts re-fetch with the merged predicate.
- [ ] **Back button** — Change filter → change again → press back → previous filter state restored everywhere.
- [ ] **Share URL** — Copy the URL with a complex filter state → open in an incognito window → after login, exact same filter state applied.
- [ ] **Empty result** — Pick a filter combination with no matching rows → every chart shows the "No data matches current filters" empty state, not a broken render or zero-everywhere KPIs.

## Date ranges

- [ ] **All 16 presets resolve** — Today, Yesterday, Last 7/14/30 Days, MTD, Last Month, QTD, YTD, Q1–Q4, Custom. Each updates URL + KPI deltas + every chart.
- [ ] **POC date anchor (dev)** — In development builds, `pocToday=2026-03-31` anchors "Today" to the last day of seed data so default landings always show data. In production builds, `pocToday=''` falls through to `new Date()`.
- [ ] **Custom range with no data** — Pick a future date range → empty states everywhere; no crash, no console error.

## Dashboard tabs

For each: Overview, Top 10, Service Breakup, Fulfillment, Insights.

- [ ] **Loads with data** — Default filters land on real data; KPI deltas computed against previous period.
- [ ] **Filter change re-fetches** — Change any filter → every chart on the tab re-fetches (network tab shows multiple `/api/prm/*` calls).
- [ ] **Tab switch preserves filters** — Change filter on Overview → switch to Top 10 → filter still applied (`FilterStore` is app-scoped).
- [ ] **Chart hover** — Tooltip appears with formatted numbers, IATA codes, region colours where applicable.
- [ ] **Sankey gradient (v17 only)** — The Service Breakup Sankey renders gradient links. On v8 (echarts 4), gradients are flatter — this is expected.

## Theme + responsive

- [ ] **Light/dark toggle** — Toggle in top bar → every chart, tooltip, card, form input flips theme. No dark-on-dark or light-on-light bleed.
- [ ] **Prefers-color-scheme** — In a fresh incognito session with OS dark mode, the app starts in dark theme on first paint (no flash of light).
- [ ] **Mobile breakpoint** — Resize to 360px → top bar collapses gracefully → charts remain readable → no horizontal scroll.

## Cross-frontend parity

- [ ] **Same data, both UIs** — `http://aeroground.localhost:4200/dashboard` and `http://aeroground.localhost:4300/dashboard` show identical KPI numbers and chart values for the same filters.
- [ ] **Switching ports keeps tenant context** — Logged-in session is per-port (different nginx, different access token in memory); login flow is identical on both.

## Error states

- [ ] **Backend down** — `docker compose stop prm` → reload dashboard → user-facing error message, no white screen of death, no console spam from retries.
- [ ] **Gateway down** — `docker compose stop gateway` → login flow shows a clear "unable to reach server" message.
- [ ] **404 page** — Browse to `/totally-fake-route` → editorial "Flight diverted" 404 page renders.

## Production-build sanity

- [ ] **v17 production bundle** — `docker compose up -d --build frontend` → bundle hashed, gzipped, lazy chunks served — verify `/dashboard` chunk is requested only when navigating there.
- [ ] **v8 production bundle** — `docker compose up -d --build frontend-v8` → differential bundles (ES5 + ES2015) generated, served correctly via nginx.

## Last-mile

- [ ] **Logs are clean** — `docker compose logs --tail=200 prm tenant auth gateway` shows no unexpected errors / stack traces across the walk-through.
- [ ] **No secrets in browser** — DevTools Application tab: no JWT in `localStorage` or `sessionStorage`; only the httpOnly `refresh_token` cookie under `/api/auth`.

---

Update this checklist whenever a new feature lands. Treat any failing checkbox as a release blocker unless explicitly waived in a PR description.
