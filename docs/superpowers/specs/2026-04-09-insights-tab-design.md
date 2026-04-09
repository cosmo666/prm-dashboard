# Insights Tab — Design Spec

**Date:** 2026-04-09
**Author:** Prerak + Claude
**Status:** Draft

## Purpose

Add a 5th dashboard tab ("Insights") that surfaces operational and strategic patterns not visible in the existing 4 tabs. Targets both operations managers (daily staffing/workload decisions) and executives (efficiency trends, outsourcing performance).

## Audience

- **Operations managers:** agent workload balance, pause patterns, peak-hour staffing needs
- **Executives:** outsourcing efficiency, monthly growth, no-show impact

## Data Sources

All visualizations use fields already present in `prm_services`. No new database columns required.

| Field | Used For |
|-------|----------|
| `paused_at` (INT, nullable) | Pause rate KPI, pause analysis |
| `prm_agent_type` (VARCHAR) | Outsourced % KPI, self vs outsourced comparison |
| `agent_no` + `agent_name` | Agent workload, specialization matrix |
| `service` (VARCHAR) | Specialization matrix, duration comparison |
| `no_show_flag` (VARCHAR) | No-show rate KPI, no-show analysis |
| `start_time` / `end_time` / `paused_at` | Duration calculations per agent type |
| `service_date` (DATE) | Monthly growth trend |
| Hourly heatmap data (from `start_time / 100`) | Demand heatmap |

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  KPI: Pause Rate │ Outsourced % │ Avg Svc/Agent │ No-Show Rate │
├─────────────────────────────────────────────────────────────────┤
│  Agent Workload (horiz bar, 60%)  │  Agent × Service Heatmap   │
│                                    │  (40%)                     │
├─────────────────────────────────────────────────────────────────┤
│  Hourly Demand Heatmap (60%)      │  Self vs Outsourced Avg    │
│                                    │  Duration (grouped bar 40%)│
├─────────────────────────────────────────────────────────────────┤
│  Monthly Volume Trend (60%)       │  No-Show by Airline (40%)  │
└─────────────────────────────────────────────────────────────────┘
```

## KPI Cards (Row 1)

4 cards in a single row, blending both audiences.

### 1. Pause Rate
- **Value:** `(count distinct id where paused_at IS NOT NULL) / (count distinct id) * 100`
- **Format:** `12.3%`
- **Source:** Existing endpoint `GET /api/prm/performance/pause-analysis` → `PauseRate`

### 2. Outsourced %
- **Value:** `(count distinct id where prm_agent_type = 'OUTSOURCED') / (count distinct id) * 100`
- **Format:** `15.2%`
- **Source:** Existing endpoint `GET /api/prm/kpis/handling-distribution` → derive from values

### 3. Avg Services per Agent
- **Value:** `(count distinct id) / (count distinct agent_no)`
- **Format:** `27.4`
- **Source:** Existing endpoint `GET /api/prm/kpis/summary` → `TotalPrm / TotalAgents`

### 4. No-Show Rate
- **Value:** `(count distinct id where no_show_flag = 'N') / (count distinct id) * 100`
- **Format:** `3.8%`
- **Source:** Existing endpoint `GET /api/prm/performance/no-shows` → sum totals and no-shows, compute rate

## Section 1: Agent Performance

### Agent Workload Distribution (horizontal bar chart)
- **What:** Services per agent, colored by `prm_agent_type` (blue = Self, orange = Outsourced)
- **Source:** Existing endpoint `GET /api/prm/rankings/agents?limit=10` → `AgentRankingItem.PrmCount`
- **Interaction:** Click bar → sets `agent_no` filter + toast

### Agent Specialization Matrix (heatmap)
- **What:** Agents (y-axis) vs service types (x-axis), cell color = count of services
- **Source:** **New endpoint** `GET /api/prm/breakdowns/agent-service-matrix`
- **Response shape:**
  ```json
  {
    "agents": ["AG001", "AG002", ...],
    "agentNames": ["Agent A1", "Agent A2", ...],
    "serviceTypes": ["WCHR", "WCHC", "MAAS", ...],
    "values": [[120, 15, 8, ...], [95, 22, 12, ...], ...]
  }
  ```
- **Grid:** max 10 agents (by volume) × 9 service types
- **Color scale:** 0 = transparent, max = cobalt accent

## Section 2: Operational Patterns

### Hourly Demand Heatmap (heatmap)
- **What:** Day of week (y) vs hour of day (x), cell = service count
- **Source:** Existing endpoint `GET /api/prm/trends/hourly` → `HourlyHeatmapResponse`
- **Note:** This endpoint exists and is used partially in Fulfillment tab for time-of-day bars. Here we render the full 7×24 heatmap.

### Self vs Outsourced Duration (grouped bar chart)
- **What:** For each service type, two bars side by side — avg duration (minutes) for Self agents vs Outsourced agents
- **Source:** **New endpoint** `GET /api/prm/performance/duration-by-agent-type`
- **Response shape:**
  ```json
  {
    "serviceTypes": ["WCHR", "WCHC", "MAAS", ...],
    "self": [32.5, 41.2, 28.8, ...],
    "outsourced": [35.1, 44.0, 30.2, ...]
  }
  ```
- **Color:** Blue = Self, Orange = Outsourced (consistent with handling distribution donut)

## Section 3: Strategic Trends

### Monthly Volume Trend (line chart)
- **What:** Month-over-month service volume with period labels
- **Source:** Existing endpoint `GET /api/prm/trends/monthly` → `MonthlyTrendResponse`
- **Display:** Line with area fill, data point labels showing count

### No-Show Analysis by Airline (bar chart)
- **What:** Top airlines by no-show count, bar height = no-show rate %, bar color = severity (green < 3%, amber 3-5%, red > 5%)
- **Source:** Existing endpoint `GET /api/prm/performance/no-shows` → `NoShowResponse`
- **Interaction:** Click bar → sets airline filter + toast

## New Backend Endpoints

### Endpoint 1: Agent-Service Matrix

**Route:** `GET /api/prm/breakdowns/agent-service-matrix`
**Controller:** `BreakdownsController`
**Service method:** `BreakdownService.GetAgentServiceMatrixAsync()`
**Query logic:**
1. Apply standard filters via `ApplyFilters()`
2. Materialize and dedup by `id` (take first row per id)
3. Group by `agent_no` × `service`
4. Count distinct ids per group
5. Limit to top 10 agents by total volume
6. Return matrix shape

**DTO:**
```csharp
public record AgentServiceMatrixResponse(
    List<string> Agents,
    List<string> AgentNames,
    List<string> ServiceTypes,
    List<List<int>> Values);
```

### Endpoint 2: Duration by Agent Type

**Route:** `GET /api/prm/performance/duration-by-agent-type`
**Controller:** `PerformanceController`
**Service method:** Add to existing service (likely `KpiService` or new method in `BreakdownService`)
**Query logic:**
1. Apply standard filters via `ApplyFilters()`
2. Materialize and dedup by `id`
3. Calculate active minutes per service (sum segments)
4. Group by `prm_agent_type` × `service`
5. Average duration per group
6. Return parallel arrays

**DTO:**
```csharp
public record DurationByAgentTypeResponse(
    List<string> ServiceTypes,
    List<double> Self,
    List<double> Outsourced);
```

## Frontend Components

### New files
- `frontend/src/app/features/dashboard/tabs/insights/insights.component.ts`
- `frontend/src/app/features/dashboard/tabs/insights/insights.component.html`
- `frontend/src/app/features/dashboard/tabs/insights/insights.component.scss`

### Modified files
- `frontend/src/app/features/dashboard/dashboard.component.ts` — add 5th tab
- `frontend/src/app/features/dashboard/services/prm-data.service.ts` — add 2 new API methods
- `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs` — add `AgentServiceMatrixResponse`
- `backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs` — add `DurationByAgentTypeResponse`
- `backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs` — add endpoint
- `backend/src/PrmDashboard.PrmService/Controllers/PerformanceController.cs` — add endpoint
- `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs` — add matrix query
- `backend/src/PrmDashboard.PrmService/Services/KpiService.cs` — add duration-by-type query

### Existing chart wrappers reused
- `KpiCardComponent` — 4 cards
- `HorizontalBarChartComponent` — agent workload
- `HeatmapChartComponent` — demand heatmap + agent specialization
- `BarChartComponent` — no-show analysis, duration comparison (need grouped bar support)
- `LineChartComponent` — monthly trend

### Grouped bar support
The current `BarChartComponent` only supports single series. The Self vs Outsourced comparison needs **two series side-by-side**. Options:
- **A) Extend BarChartComponent** to accept an optional second series — minimal change, keeps one component
- **B) New GroupedBarChartComponent** — cleaner separation

**Decision:** Option A. Add an optional `series2` input to `BarChartComponent` with its own color/name. When present, render as grouped bars.

## Click-to-Filter Interactions

| Visual | Click Target | Filter Action |
|--------|-------------|---------------|
| Agent Workload bar | Agent bar | `setFilter({ agentNo: agent_no })` |
| Agent Specialization cell | Heatmap cell | `setService([service])` + `setFilter({ agentNo })` |
| Self vs Outsourced bar | Bar group | `setHandledBy([type])` |
| Monthly Trend point | Month point | `setDateRange()` to that month |
| No-Show by Airline bar | Airline bar | `setAirline([code])` |

## Responsive Behavior

| Breakpoint | Layout Change |
|------------|---------------|
| > 1200px | 2-column grid per section (60/40 split) |
| 768–1200px | Stack to single column per section |
| < 768px | KPI cards wrap to 2×2 grid |

## Dependencies

- No new npm packages
- No new NuGet packages
- No database schema changes
- 2 new backend endpoints (both read-only aggregation queries)
