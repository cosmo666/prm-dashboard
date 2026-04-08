# PRM Dashboard E2E Checklist

Each scenario must pass before marking the POC complete.

## Multi-Tenant Isolation
- [ ] Visit http://aeroground.localhost:4200 → login page shows "AeroGround Services"
- [ ] Visit http://skyserve.localhost:4200 → login page shows "SkyServe Ground Handling"
- [ ] Visit http://globalprm.localhost:4200 → login page shows "GlobalPRM"
- [ ] Login to aeroground as admin/admin123 → airports dropdown shows BLR, HYD, DEL only
- [ ] Logout, login to skyserve as admin/admin123 → airports dropdown shows BLR, BOM, MAA only
- [ ] Verify PRM data differs between tenants (different row counts, different passengers)

## RBAC
- [ ] Login as aeroground/john → dropdown shows BLR, HYD only (no DEL)
- [ ] Login as aeroground/ravi → dropdown shows DEL only (disabled dropdown)
- [ ] In DevTools, force-modify airport query param to 'BLR' while logged in as ravi → expect 403 from PRM Service
- [ ] Login as skyserve/deepak → shows MAA only, cannot see other airports

## Auth Flow
- [ ] Invalid credentials show "Login failed" error
- [ ] After login, refresh browser → still logged in (httpOnly refresh cookie re-hydrates)
- [ ] Wait 16 minutes (access token expires) → click a filter → interceptor auto-refreshes, no re-login prompt
- [ ] Logout → redirected to /login, tokens cleared

## Dashboard Navigation
- [ ] Home page shows PRM Dashboard gradient card
- [ ] Click card → navigates to /dashboard
- [ ] Click "Back" in top bar → returns to /home
- [ ] Dashboard defaults to "Month to Date" preset (March 1-31, 2026)
- [ ] Airport dropdown switches trigger full dashboard re-fetch

## Tab 1 — Overview
- [ ] 5 KPI cards render with values, deltas, icons
- [ ] Daily Trend bar chart shows 31 bars for MTD
- [ ] Handling distribution donut shows Self/Outsourced percentages
- [ ] Service Type donut shows top 5 types
- [ ] Duration histogram shows buckets
- [ ] Location horizontal bars show airport zones

## Tab 2 — Top 10
- [ ] Top Airlines bars render
- [ ] Top Flights bars render
- [ ] Agents table: rank, agentNo, agentName, prmCount, avgDuration, topService, topAirline, daysActive
- [ ] Top Routes horizontal bars render
- [ ] No-Show Rate bars show per-airline no-show percentages

## Tab 3 — Service Breakup
- [ ] Stacked monthly trend line chart renders with service type series
- [ ] Agent type Sankey chart (3 levels: agent type → service → flights)
- [ ] Airline donut chart renders
- [ ] Hourly heatmap (7 days × 24 hours) renders

## Tab 4 — Fulfillment
- [ ] 3 KPI cards (requested, provided, fulfillment rate)
- [ ] Requested vs Provided trend line chart
- [ ] Walk-up rate donut
- [ ] Duration stats (min, max, avg, p50, p90, p95)
- [ ] Pause analysis (pause count, rate, avg duration, breakdown by service)

## Filters
- [ ] Airline dropdown filters all tabs
- [ ] Service dropdown filters all tabs
- [ ] Handled By dropdown filters all tabs
- [ ] All date presets produce correct date ranges
- [ ] Clear All resets secondary filters
- [ ] Filter chips appear and are removable

## Edge Cases
- [ ] Select a date range with no data → charts show "No data matches current filters" empty state
- [ ] With slow network, loading skeletons appear on charts
- [ ] Changing airport clears secondary filters

## Cross-browser
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if available)

## Docker Stack Verification
```bash
# Bring up the full stack
docker compose up --build -d

# Verify health
curl http://localhost:5000/health  # Gateway
curl http://localhost:5001/health  # Auth
curl http://localhost:5002/health  # Tenant
curl http://localhost:5003/health  # PRM

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: aeroground" \
  -d '{"username":"admin","password":"admin123"}'

# Verify seed data
docker compose exec mysql mysql -uroot -prootpassword -e "
  SELECT slug, name FROM prm_master.tenants;
  SELECT COUNT(*) AS aeroground FROM aeroground_db.prm_services;
  SELECT COUNT(*) AS skyserve FROM skyserve_db.prm_services;
  SELECT COUNT(*) AS globalprm FROM globalprm_db.prm_services;
"
```
