# PRM Dashboard — Design Specification

**Date:** 2026-04-08
**Author:** Prerak Gupta + Claude
**Status:** Draft — awaiting review
**Type:** POC (Proof of Concept) with production-ready architecture

---

## 1. Overview

A multi-tenant Angular + .NET microservice application for PRM (Passenger with Reduced Mobility) dashboard analytics. Ground handling companies use this to monitor PRM service metrics across airports.

**Core flow:** Employee visits `{tenant}.prm-app.com` → logs in → sees home page with "PRM Dashboard" button → selects airport from top bar dropdown (RBAC-filtered) → views interactive analytics dashboard with 4 tabs.

## 2. Architecture

### 2.1 Microservice Layout

```
Browser (Angular 17+)
  ↓ HTTPS
API Gateway (Ocelot / .NET 8, port 5000)
  ├── /api/auth/**    → Auth Service (port 5001)
  ├── /api/tenants/** → Tenant Service (port 5002)
  └── /api/prm/**     → PRM Service (port 5003)
                            ↓
                  ┌─────────┴──────────┐
                  │   DATABASE LAYER   │
                  │ Master DB (MySQL)  │
                  │ Tenant 1 DB        │
                  │ Tenant 2 DB        │
                  │ Tenant 3 DB        │
                  └────────────────────┘
```

### 2.2 Services

| Service | Port | Responsibility |
|---------|------|----------------|
| **API Gateway** | 5000 | Subdomain extraction, route forwarding, JWT validation, CORS, rate limiting |
| **Auth Service** | 5001 | Login, token refresh, logout, employee profile. Owns: employees, refresh_tokens |
| **Tenant Service** | 5002 | Tenant resolution, airport list, tenant branding. Owns: tenants, employee_airports |
| **PRM Service** | 5003 | All dashboard data, aggregations, filters, export. Queries tenant DBs |

### 2.3 Gateway Behavior

- Extracts subdomain from `Host` header (e.g., `aeroground` from `aeroground.prm-app.com`)
- Adds `X-Tenant-Slug` header to all downstream requests
- Validates JWT signature and expiry on all `/api/prm/**` and `/api/tenants/airports` routes
- Auth endpoints (`/api/auth/login`, `/api/auth/refresh`) are public (no JWT required)

## 3. Data Model

### 3.1 Master Database (shared)

**tenants**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO | |
| name | VARCHAR(100) | "AeroGround Services" |
| slug | VARCHAR(50) UNIQUE | "aeroground" — used in subdomain |
| db_host | VARCHAR(255) | MySQL host for tenant DB |
| db_port | INT | |
| db_name | VARCHAR(100) | |
| db_user | VARCHAR(100) | |
| db_password | VARCHAR(255) | AES-256 encrypted at rest |
| is_active | BOOLEAN | |
| created_at | DATETIME | |
| logo_url | VARCHAR(500) | Tenant logo for login screen |
| primary_color | VARCHAR(7) | Hex color for branding |

**employees**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO | |
| tenant_id | INT FK → tenants | |
| username | VARCHAR(50) | Unique within tenant |
| password_hash | VARCHAR(255) | bcrypt |
| display_name | VARCHAR(100) | |
| email | VARCHAR(100) | |
| is_active | BOOLEAN | |
| created_at | DATETIME | |
| last_login | DATETIME | |

UNIQUE constraint: (tenant_id, username)

**employee_airports**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO | |
| employee_id | INT FK → employees | |
| airport_code | VARCHAR(10) | "BLR" |
| airport_name | VARCHAR(100) | "Bengaluru Kempegowda International" |

UNIQUE constraint: (employee_id, airport_code)

**refresh_tokens**
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO | |
| employee_id | INT FK → employees | |
| token | VARCHAR(500) UNIQUE | |
| expires_at | DATETIME | 7 days from creation |
| created_at | DATETIME | |
| revoked | BOOLEAN | |

### 3.2 Tenant Database (one per tenant)

**prm_services**
| Column | Type | Example | Notes |
|--------|------|---------|-------|
| row_id | INT PK AUTO | 1 | True PK (id can repeat for paused/resumed) |
| id | INT | 3860991 | PRM service ID — groups paused/resumed rows |
| flight | VARCHAR(20) | "EK 568" | Airline code + flight number |
| flight_number | INT | 568 | Numeric flight number |
| agent_name | VARCHAR(100) | "Bondikala Naveen" | |
| agent_no | VARCHAR(20) | "10030720" | |
| passenger_name | VARCHAR(200) | "FAHEEMUNNISA/FAHEEMU" | |
| prm_agent_type | VARCHAR(20) | "SELF" | SELF or OUTSOURCED |
| start_time | INT | 237 | HHMM without separator (2:37) |
| paused_at | INT NULL | 320 | HHMM, NULL if not paused |
| end_time | INT | 340 | HHMM |
| service | VARCHAR(20) | "WCHR" | WCHR, WCHC, MAAS, WCHS, BLND, DPNA, UMNR, MEDA, WCMP |
| seat_number | VARCHAR(10) | "8G" | |
| scanned_by | VARCHAR(50) | "Mobile Scan Entry" | |
| scanned_by_user | VARCHAR(100) | "Bondikala Naveen" | |
| remarks | TEXT NULL | | |
| pos_location | VARCHAR(50) | "Aircraft Point" | |
| no_show_flag | VARCHAR(5) NULL | "N" | "N" or NULL |
| loc_name | VARCHAR(10) | "BLR" | Airport code |
| arrival | VARCHAR(10) | "DXB" | |
| airline | VARCHAR(10) | "EK" | |
| emp_type | VARCHAR(20) | "Employee" | |
| departure | VARCHAR(10) | "BLR" | |
| requested | INT DEFAULT 0 | 0 | Pre-requested PRM count |
| service_date | DATE | 2026-03-31 | |

**Indexes:**
- `idx_loc_date` (loc_name, service_date) — main filter
- `idx_date_range` (service_date, loc_name, airline) — composite for filtered queries
- `idx_id` (id) — dedup grouping
- `idx_airline` (airline)
- `idx_service` (service)
- `idx_agent` (agent_no)
- `idx_prm_type` (prm_agent_type)

### 3.3 Deduplication Logic

When a PRM service is paused and resumed, it creates multiple rows with the **same `id`**.

- **Count:** `COUNT(DISTINCT id)` — each service ID counts as 1
- **Duration (no pause):** `end_time - start_time`
- **Duration (with pause):** `(paused_at - start_time)` for the paused row + `(end_time - start_time)` for the resumed row. Sum all active segments per ID.

## 4. API Design

### 4.1 Auth Service — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/login` | Public | Body: { username, password }. Tenant from X-Tenant-Slug header. Returns: { access_token, employee } |
| POST | `/refresh` | Cookie | Refresh token via httpOnly cookie. Returns: { access_token } |
| POST | `/logout` | JWT | Revokes refresh token |
| GET | `/me` | JWT | Employee profile + allowed airports |

### 4.2 Tenant Service — `/api/tenants`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resolve/{slug}` | Internal | Service-to-service only. Returns tenant ID + DB connection info |
| GET | `/airports` | JWT | Airports for current employee (filtered by JWT claims) |
| GET | `/config` | Public | Tenant branding (logo, primary color) for login screen theming |

### 4.3 PRM Service — `/api/prm` (6 groups, 19 endpoints)

**Common query parameters (all endpoints):**
- `airport` (required) — validated against JWT airports claim
- `date_from`, `date_to` — date range
- `airline`, `service`, `handled_by`, `flight`, `agent_no` — optional filters

**KPIs & Aggregations (3):**
| Endpoint | Description |
|----------|-------------|
| GET `/kpis/summary` | Total PRM, agents, avg/agent/day, avg duration, fulfillment %. Includes prev period for delta |
| GET `/kpis/handling-distribution` | SELF vs OUTSOURCED counts + percentages |
| GET `/kpis/requested-vs-provided` | Total requested, provided, fulfillment rate |

**Trends & Time Series (4):**
| Endpoint | Description |
|----------|-------------|
| GET `/trends/daily` | Daily PRM count. Supports `?metric=count\|duration\|agents` |
| GET `/trends/monthly` | Monthly aggregation |
| GET `/trends/hourly` | Hourly heatmap data (hour of day × day of week) |
| GET `/trends/requested-vs-provided` | Daily dual-axis data (provided + requested) |

**Rankings & Leaderboards (4):**
| Endpoint | Description |
|----------|-------------|
| GET `/rankings/airlines` | Top N airlines. `?limit=10&sort=desc` |
| GET `/rankings/flights` | Top N flights |
| GET `/rankings/agents` | Top N agents with agent_no, name, count, avg_duration |
| GET `/rankings/services` | Service types ranked by volume |

**Breakdowns & Drill-Down (5):**
| Endpoint | Description |
|----------|-------------|
| GET `/breakdowns/by-service-type` | Monthly matrix (rows=months, cols=service types) |
| GET `/breakdowns/by-agent-type` | Sankey data: agent_type → service_type → flight |
| GET `/breakdowns/by-airline` | PRM count per airline with sub-breakdowns |
| GET `/breakdowns/by-location` | POS location distribution |
| GET `/breakdowns/by-route` | Departure→Arrival route pairs with counts |

**Duration & Performance (4):**
| Endpoint | Description |
|----------|-------------|
| GET `/performance/duration-stats` | Min, max, avg, median, P90, P95 duration |
| GET `/performance/duration-distribution` | Histogram buckets (0-15m, 15-30m, etc.) |
| GET `/performance/no-shows` | No-show count + rate by airline/flight |
| GET `/performance/pause-analysis` | Pause frequency, avg pause duration |

**Filters, Raw Data & Export (4):**
| Endpoint | Description |
|----------|-------------|
| GET `/filters/options` | Distinct values for all filter dropdowns |
| GET `/records` | Paginated raw records. `?page=1&size=50&sort=start_time:desc` |
| GET `/records/{id}/segments` | All rows for a PRM ID (pause/resume timeline) |
| GET `/export` | CSV/Excel export. `?format=csv\|xlsx` |

### 4.4 Caching & Load Management

- **Debounced API calls** — Angular debounces filter changes (300ms)
- **Active-tab-only fetch** — only fetch endpoints for the visible tab; lazy-load other tabs on switch
- **In-memory cache** — `/filters/options` and `/kpis/summary` cached 5 min per tenant+airport
- **Connection string cache** — PRM Service caches tenant DB connections (5 min TTL)
- **Parallel requests** — Angular fires all tab endpoints simultaneously (3-4 calls, not 19)
- **Future:** Redis cache layer, query result caching by filter hash

## 5. Frontend Architecture

### 5.1 Stack

- **Angular 17+** with standalone components
- **Angular Material 3** with custom theme (Modern Hybrid: light background, gradient KPI cards)
- **Apache ECharts** via ngx-echarts for all charts
- **NgRx Signal Store** for global state (filters, tenant context, auth)
- **Lazy-loaded modules:** AuthModule, DashboardModule

### 5.2 App Shell

```
┌─────────────────────────────────────────────────────────┐
│  TOP ACTION BAR                                         │
│  [Tenant Logo] [Tenant Name]     [Airport: BLR ▾]  [👤]│
├─────────────────────────────────────────────────────────┤
│  HOME PAGE                                              │
│  ┌─────────────────┐                                    │
│  │ PRM Dashboard   │  ← Big button, navigates to       │
│  │     📊          │     /dashboard                     │
│  └─────────────────┘                                    │
│  (Future: more dashboard buttons can be added here)     │
└─────────────────────────────────────────────────────────┘
```

After clicking "PRM Dashboard":

```
┌─────────────────────────────────────────────────────────┐
│  TOP ACTION BAR                                         │
│  [Logo] [Name]    [Airport: BLR ▾] [← Back]  [👤 John] │
├─────────────────────────────────────────────────────────┤
│  FILTER BAR (synced across all tabs)                    │
│  [Airline ▾] [Service ▾] [Handled By ▾] [Date Range ▾] │
│  Active: [WCHR ✕] [Mar 2026 ✕]           [Clear All]   │
├─────────────────────────────────────────────────────────┤
│  TAB BAR                                                │
│  [Overview] [Top 10] [Service Breakup] [Fulfillment]    │
├─────────────────────────────────────────────────────────┤
│  DASHBOARD CONTENT (3 rows max, no scroll)              │
│  Row 1: KPI cards                                       │
│  Row 2: Charts                                          │
│  Row 3: Charts                                          │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Airport Dropdown (Top Bar)

- Located in the top action bar, always visible
- Shows only airports the employee has access to (from JWT airports claim)
- Changing airport triggers full dashboard data refresh
- Selected airport persisted in URL param + localStorage
- If employee has only 1 airport, dropdown is disabled (shows single value)

### 5.4 Login Page

Split layout inspired by the AISATS reference:
- **Left side (40%):** Tenant logo (from `/api/tenants/config`), username field, password field, "Remember me" checkbox, "Log in" button, "Powered by [App Name]" footer
- **Right side (60%):** Full-bleed aviation/airport image with blue overlay
- Tenant name auto-resolved from subdomain and displayed
- On login success → navigate to home page

### 5.5 Home Page

- Clean page with tenant branding
- Single prominent button: **"PRM Dashboard"** → navigates to `/dashboard`
- Airport dropdown in top bar (not on this page content)
- Designed for future expansion (more dashboard buttons: Roster, Flights, etc.)

## 6. Dashboard Pages

### 6.1 Design Principles

- **Max 3 rows of visuals per tab** — everything fits on one screen, no scrolling
- **Modern Hybrid theme:** Light background, gradient KPI cards, white chart containers, soft shadows
- **Dark/light toggle** available (future)
- **All filters synced** across tabs via NgRx Signal Store + URL query params

### 6.2 Interactions (all charts)

- **Hover effects:** Scale up (1.02x) + subtle glow/shadow on bars, donut segments, table rows
- **Rich tooltips:** Multi-line with count, % of total, vs average comparison, sub-breakdowns
- **Drill-down:** Click any bar/segment → cross-filters all charts on the page (adds filter chip)
- **Interactive legends:** Click legend item to show/hide that series
- **Cursor:** Pointer on all clickable elements
- **Transitions:** 300ms ease-in-out on all chart updates
- **Loading skeletons:** Shimmer placeholder while data loads
- **Empty states:** Friendly message when no data matches filters

### 6.3 Date Range Presets

Clicking the date range filter opens a dropdown with:

| Preset | Calculation |
|--------|-------------|
| Today | Current date |
| Yesterday | Current date - 1 |
| Last 7 Days | Current date - 6 → Current date |
| Last 30 Days | Current date - 29 → Current date |
| Month to Date (MTD) | 1st of current month → Current date |
| Last Month | Full previous month |
| Last 3 Months | 3 months back, full months |
| Last 6 Months | 6 months back, full months |
| Year to Date (YTD) | Jan 1 → Current date |
| Calendar Year | Jan 1 → Dec 31 of selected year |
| Last Year | Full previous year |
| Q1 / Q2 / Q3 / Q4 | Fixed quarter boundaries |
| Custom Range | Dual calendar picker |

- "Today" recalculates daily using system clock
- POC defaults current date to 2026-03-31 (end of seed data)
- Selected preset label shown in filter chip
- URL-persisted: `?date_preset=mtd` or `?date_from=...&date_to=...`

### 6.4 Tab 1 — Overview (3 rows, 5 KPIs + 4 charts)

**Row 1:** 5 gradient KPI cards
| KPI | Source | Delta |
|-----|--------|-------|
| Total PRM Services | COUNT(DISTINCT id) | vs prev period % |
| Active Agents | COUNT(DISTINCT agent_no) | Self/Outsourced sub-text |
| Avg Services/Agent/Day | total_prm / agents / days | vs prev period |
| Avg Service Duration | Avg active segment time (min) | vs prev period |
| Fulfillment Rate | provided / (provided + unfulfilled) % | vs prev period |

**Row 2:** Daily PRM Trend (2/3 width) + Handling Distribution donut (1/3 width)
- Daily Trend: X=Day of Month, Y=PRM Count, dashed avg line. Toggle: Line ↔ Bar
- Donut: Self vs Outsourced with counts + agent count cards below

**Row 3:** Service Type donut (1/3) + Duration Distribution histogram (1/3) + Location horizontal bars (1/3)
- Service donut: WCHR, WCHC, MAAS, WCHS, Others with % labels
- Duration: X=Duration bucket (min), Y=Count, color-coded (green/amber/red). Shows P50, P90, Avg
- Location: Y=Location name, X=PRM count + % of total

### 6.5 Tab 2 — Top 10 (3 rows, 5 charts)

**Row 1:** Top 10 Airlines bars (1/2) + Top 10 Flights bars (1/2)
- Airlines: X=Airline code, Y=PRM count, color=carrier region (Indian/Gulf/APAC/Other)
- Flights: X=Flight number, Y=PRM count, color=airline

**Row 2:** Top 10 Agents table (full width)
- Columns: Rank (gold/silver/bronze badges), Agent#, Name, PRM Count, Avg Duration (color-coded), Top Service, Top Airline, Days Active

**Row 3:** Top 10 Routes horizontal bars (1/2) + No-Show Rate by Airline bars (1/2)
- Routes: Y=Departure→Arrival, X=Count + %
- No-Show: X=Airline, Y=No-Show %, color thresholds (red >5%, amber 3-5%, green <3%)

### 6.6 Tab 3 — Service Breakup (3 rows, 4 charts + 9 cards + matrix)

**Row 1:** 9 service type summary cards (WCHR, WCHC, MAAS, WCHS, DPNA, UMNR, BLND, MEDA, WCMP) — count + % — click to filter

**Row 2:** Monthly matrix table (60% width) + Stacked trend chart (40% width)
- Matrix: Rows=Month-Year, Cols=Service types, Values=PRM count, highlighted column max, Total column. Click cell → drill
- Stacked: X=Month, Y=Count, stacked by service type. Toggle: Stacked ↔ %

**Row 3:** Avg Duration by Service Type bars (1/2) + PRM by Day of Week bars (1/2)
- Duration: X=Service type, Y=Avg minutes. Hover shows P50/P90
- Day of Week: X=Day, Y=Avg daily count, color=Weekday (blue) vs Weekend (amber)

### 6.7 Tab 4 — Fulfillment (3 rows, 4 KPIs + 4 charts)

**Row 1:** 4 KPI cards — PRM Requested, Provided vs Requested, Total Provided, Walk-up Rate

**Row 2:** Daily Trend dual-axis (1/2) + Sankey flow (1/2)
- Dual-axis: X=Day, Left Y=Provided (bars), Right Y=Requested (line)
- Sankey: Agent Type → Service Type → Top Flights. Node width=volume. Click node → drill

**Row 3:** PRM by Time of Day bars (1/2) + Cumulative PRM pace chart (1/2)
- Time of Day: X=4hr time slots (00-04, 04-08, etc.), Y=PRM count, color=Peak/High/Medium/Low
- Cumulative: X=Day, Y=Running total, area chart with dashed target pace line

## 7. Authentication & RBAC

### 7.1 Login Flow

1. User visits `aeroground.prm-app.com`
2. Angular extracts subdomain `aeroground`
3. Calls `GET /api/tenants/config?slug=aeroground` → gets logo, colors
4. Renders login page with tenant branding (split layout: form left, aviation image right)
5. User submits credentials
6. `POST /api/auth/login` with `X-Tenant-Slug: aeroground` header
7. Auth Service validates against Master DB (employees table, scoped by tenant_id)
8. Returns JWT access token (15 min) + sets refresh token as httpOnly cookie (7 days)
9. Angular stores access token in memory (not localStorage), navigates to home page
10. Home page shows "PRM Dashboard" button + airport dropdown in top bar

### 7.2 JWT Structure

```json
{
  "sub": 42,
  "tenant_id": 1,
  "tenant_slug": "aeroground",
  "name": "John Doe",
  "airports": ["BLR", "HYD", "DEL"],
  "iat": 1711900800,
  "exp": 1711901700
}
```

### 7.3 Airport Access Enforcement

- JWT `airports` claim contains allowed airport codes
- Angular shows only these airports in the top bar dropdown
- PRM Service validates `?airport=X` param against JWT airports on every request
- Unauthorized airport → 403 Forbidden

### 7.4 Token Refresh

- Angular HTTP interceptor detects 401 responses
- Automatically calls `POST /api/auth/refresh` with httpOnly cookie
- Gets new access token, retries original request
- If refresh fails → redirect to login

## 8. Seed Data

### 8.1 Tenants

| Slug | Name | Airports |
|------|------|----------|
| aeroground | AeroGround Services | BLR, HYD, DEL |
| skyserve | SkyServe Ground Handling | BLR, BOM, MAA |
| globalprm | GlobalPRM | SYD, KUL, JFK |

### 8.2 Employees (4 per tenant, 12 total)

Each tenant has:
- Admin (all airports)
- User with 2 airports
- User with 1 airport
- User with 1 different airport

Demo credentials: username/password format (e.g., admin/admin123, john/john123)

### 8.3 PRM Data

- **Volume:** 100-200 records per airport per month
- **Date range:** December 1, 2025 to March 31, 2026 (4 months)
- **Total:** ~400-800 records per airport, ~2,400-7,200 per tenant
- **Realistic distribution:** Service types weighted (WCHR ~92%, WCHC ~5%, others ~3%), airline distribution matching real patterns, time-of-day patterns (peak 08-12), pause/resume rows for ~12% of services
- **POC current date:** 2026-03-31

## 9. Tech Stack Summary

### Backend (.NET 8)
- ASP.NET Core Web API (per microservice)
- Ocelot API Gateway
- Entity Framework Core with MySQL (Pomelo provider)
- BCrypt.Net for password hashing
- System.IdentityModel.Tokens.Jwt for JWT
- Docker containers per service

### Frontend (Angular 17+)
- Standalone components, lazy-loaded modules
- Angular Material 3 with custom theme
- Apache ECharts via ngx-echarts
- NgRx Signal Store
- Angular Router with guards

### Infrastructure
- Docker Compose for local development
- MySQL 8.0 (4 databases: 1 master + 3 tenant)
- Cloud-ready (Azure/AWS) container deployment

## 10. Folder Structure

```
prm-dashboard/
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── src/
│   │   ├── PrmDashboard.Gateway/          # Ocelot API Gateway
│   │   │   ├── Program.cs
│   │   │   ├── ocelot.json
│   │   │   └── Middleware/
│   │   │       └── TenantExtractionMiddleware.cs
│   │   │
│   │   ├── PrmDashboard.AuthService/       # Auth microservice
│   │   │   ├── Controllers/
│   │   │   ├── Services/
│   │   │   ├── Models/
│   │   │   └── Dockerfile
│   │   │
│   │   ├── PrmDashboard.TenantService/     # Tenant microservice
│   │   │   ├── Controllers/
│   │   │   ├── Services/
│   │   │   ├── Models/
│   │   │   └── Dockerfile
│   │   │
│   │   ├── PrmDashboard.PrmService/        # PRM data microservice
│   │   │   ├── Controllers/
│   │   │   │   ├── KpisController.cs
│   │   │   │   ├── TrendsController.cs
│   │   │   │   ├── RankingsController.cs
│   │   │   │   ├── BreakdownsController.cs
│   │   │   │   ├── PerformanceController.cs
│   │   │   │   └── RecordsController.cs
│   │   │   ├── Services/
│   │   │   ├── Models/
│   │   │   ├── Middleware/
│   │   │   │   └── AirportAccessMiddleware.cs
│   │   │   └── Dockerfile
│   │   │
│   │   └── PrmDashboard.Shared/            # Shared library
│   │       ├── Models/
│   │       ├── DTOs/
│   │       └── Extensions/
│   │
│   ├── tests/
│   └── PrmDashboard.sln
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                       # Singleton services
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.guard.ts
│   │   │   │   │   ├── auth.interceptor.ts
│   │   │   │   │   └── tenant.resolver.ts
│   │   │   │   ├── api/
│   │   │   │   │   └── api.client.ts
│   │   │   │   └── store/
│   │   │   │       ├── filter.store.ts
│   │   │   │       └── tenant.store.ts
│   │   │   │
│   │   │   ├── features/
│   │   │   │   ├── auth/                   # Lazy: login page
│   │   │   │   │   └── login/
│   │   │   │   ├── home/                   # Lazy: home page with PRM button
│   │   │   │   │   └── home.component.ts
│   │   │   │   └── dashboard/              # Lazy: PRM dashboard
│   │   │   │       ├── dashboard.component.ts
│   │   │   │       ├── components/
│   │   │   │       │   ├── filter-bar/
│   │   │   │       │   ├── kpi-card/
│   │   │   │       │   └── date-range-picker/
│   │   │   │       └── tabs/
│   │   │   │           ├── overview/
│   │   │   │           ├── top10/
│   │   │   │           ├── service-breakup/
│   │   │   │           └── fulfillment/
│   │   │   │
│   │   │   ├── shared/                     # Shared components
│   │   │   │   ├── components/
│   │   │   │   │   ├── top-bar/
│   │   │   │   │   └── airport-selector/
│   │   │   │   ├── charts/                 # ECharts wrapper components
│   │   │   │   │   ├── bar-chart/
│   │   │   │   │   ├── donut-chart/
│   │   │   │   │   ├── line-chart/
│   │   │   │   │   ├── heatmap-chart/
│   │   │   │   │   ├── sankey-chart/
│   │   │   │   │   └── horizontal-bar-chart/
│   │   │   │   └── pipes/
│   │   │   │
│   │   │   ├── app.component.ts
│   │   │   ├── app.routes.ts
│   │   │   └── app.config.ts
│   │   │
│   │   ├── assets/
│   │   ├── environments/
│   │   └── styles/
│   │       ├── theme.scss                  # Material 3 custom theme
│   │       └── _variables.scss
│   │
│   ├── angular.json
│   ├── package.json
│   └── Dockerfile
│
├── database/
│   ├── init/
│   │   ├── 01-master-schema.sql
│   │   ├── 02-tenant-schema.sql
│   │   ├── 03-seed-tenants.sql
│   │   ├── 04-seed-employees.sql
│   │   └── 05-seed-prm-data.sql
│   └── migrations/
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-08-prm-dashboard-design.md
```

## 11. Non-Functional Requirements

| Concern | Approach |
|---------|----------|
| **Performance** | Composite DB indexes, in-memory caching, debounced filters, parallel API calls |
| **Security** | JWT (15 min), httpOnly refresh cookies, bcrypt passwords, encrypted DB credentials, CORS whitelist, airport-level RBAC |
| **Scalability** | Microservice architecture, per-tenant DB isolation, containerized deployment |
| **Observability** | Structured logging per service, correlation ID across services (future: OpenTelemetry) |
| **Mobile** | Responsive design (desktop-first, mobile-adaptive) |
| **Deployment** | Docker Compose (local), cloud-ready containers (Azure/AWS) |
