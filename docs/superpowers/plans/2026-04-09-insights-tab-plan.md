# Insights Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th "Insights" dashboard tab with 4 KPIs and 6 charts showing agent performance, operational patterns, and strategic trends.

**Architecture:** 2 new backend endpoints (agent-service matrix, duration by agent type) + 1 new Angular tab component consuming existing + new endpoints via `PrmDataService`. Reuses all existing chart wrappers. Extends `BarChartComponent` with optional grouped-bar support for the Self vs Outsourced comparison.

**Tech Stack:** .NET 8 (C# record DTOs, EF Core query), Angular 17 (standalone component, NgRx Signal Store, ECharts)

---

### Task 1: Backend DTOs

**Files:**
- Modify: `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs`
- Modify: `backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs`

- [ ] **Step 1: Add AgentServiceMatrixResponse to BreakdownDtos.cs**

Append after `RouteBreakdownResponse`:

```csharp
public record AgentServiceMatrixResponse(
    List<string> Agents,
    List<string> AgentNames,
    List<string> ServiceTypes,
    List<List<int>> Values);
```

- [ ] **Step 2: Add DurationByAgentTypeResponse to PerformanceDtos.cs**

Append after `PauseAnalysisResponse`:

```csharp
public record DurationByAgentTypeResponse(
    List<string> ServiceTypes,
    List<double> Self,
    List<double> Outsourced);
```

- [ ] **Step 3: Build to verify compilation**

Run: `cd backend && dotnet build`
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs backend/src/PrmDashboard.Shared/DTOs/PerformanceDtos.cs
git commit -m "feat(dto): add AgentServiceMatrixResponse and DurationByAgentTypeResponse"
```

---

### Task 2: Agent-Service Matrix Backend Endpoint

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs`
- Modify: `backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs`

- [ ] **Step 1: Add GetAgentServiceMatrixAsync to BreakdownService.cs**

Add this method at the end of the class (before closing `}`):

```csharp
/// <summary>
/// Agent × Service Type matrix — top 10 agents by volume, count per service type.
/// </summary>
public async Task<AgentServiceMatrixResponse> GetAgentServiceMatrixAsync(
    string tenantSlug, PrmFilterParams filters, int limit = 10, CancellationToken ct = default)
{
    await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
    var query = ApplyFilters(db, filters);

    var rows = await query.ToListAsync(ct);
    var deduped = rows
        .GroupBy(r => r.Id)
        .Select(g => g.OrderBy(r => r.RowId).First())
        .ToList();

    // Top N agents by total volume
    var topAgents = deduped
        .Where(r => !string.IsNullOrEmpty(r.AgentNo))
        .GroupBy(r => r.AgentNo!)
        .OrderByDescending(g => g.Count())
        .Take(limit)
        .Select(g => new { AgentNo = g.Key, Name = g.First().AgentName ?? g.Key })
        .ToList();

    var serviceTypes = deduped
        .Select(r => r.Service)
        .Distinct()
        .OrderBy(s => s)
        .ToList();

    // Build count matrix
    var agentSet = topAgents.Select(a => a.AgentNo).ToHashSet();
    var counts = deduped
        .Where(r => r.AgentNo != null && agentSet.Contains(r.AgentNo))
        .GroupBy(r => new { r.AgentNo, r.Service })
        .ToDictionary(g => (g.Key.AgentNo!, g.Key.Service), g => g.Count());

    var values = topAgents.Select(a =>
        serviceTypes.Select(s => counts.GetValueOrDefault((a.AgentNo, s), 0)).ToList()
    ).ToList();

    _logger.LogInformation("Agent-service matrix for {Slug}/{Airport}: {Agents} agents x {Types} types",
        tenantSlug, filters.Airport, topAgents.Count, serviceTypes.Count);

    return new AgentServiceMatrixResponse(
        topAgents.Select(a => a.AgentNo).ToList(),
        topAgents.Select(a => a.Name).ToList(),
        serviceTypes,
        values);
}
```

- [ ] **Step 2: Add controller endpoint in BreakdownsController.cs**

Add after the `GetByRoute` method:

```csharp
[HttpGet("agent-service-matrix")]
public async Task<IActionResult> GetAgentServiceMatrix(
    [FromQuery] PrmFilterParams filters, [FromQuery] int limit = 10, CancellationToken ct = default)
{
    var slug = GetTenantSlug();
    var result = await _breakdownService.GetAgentServiceMatrixAsync(slug, filters, limit, ct);
    return Ok(result);
}
```

- [ ] **Step 3: Build to verify**

Run: `cd backend && dotnet build`
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/BreakdownService.cs backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs
git commit -m "feat(api): add GET /api/prm/breakdowns/agent-service-matrix endpoint"
```

---

### Task 3: Duration by Agent Type Backend Endpoint

**Files:**
- Modify: `backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs`
- Modify: `backend/src/PrmDashboard.PrmService/Controllers/PerformanceController.cs`

- [ ] **Step 1: Add GetDurationByAgentTypeAsync to PerformanceService.cs**

Add this method after `GetPauseAnalysisAsync` (before `ComputeDurationsAsync`):

```csharp
/// <summary>
/// Avg duration grouped by prm_agent_type (SELF/OUTSOURCED) per service type.
/// </summary>
public async Task<DurationByAgentTypeResponse> GetDurationByAgentTypeAsync(
    string tenantSlug, PrmFilterParams filters, CancellationToken ct = default)
{
    await using var db = await _factory.CreateDbContextAsync(tenantSlug, ct);
    var query = ApplyFilters(db, filters);
    var rows = await query.ToListAsync(ct);

    // Compute duration per service id, keeping agent type and service
    var perService = rows
        .GroupBy(r => r.Id)
        .Select(g =>
        {
            var first = g.OrderBy(r => r.RowId).First();
            var duration = g.Sum(r =>
                TimeHelpers.CalculateActiveMinutes(r.StartTime, r.PausedAt, r.EndTime));
            return new { first.PrmAgentType, first.Service, Duration = duration };
        })
        .ToList();

    var serviceTypes = perService
        .Select(r => r.Service)
        .Distinct()
        .OrderBy(s => s)
        .ToList();

    var selfAvg = serviceTypes.Select(s =>
    {
        var items = perService.Where(r => r.Service == s && r.PrmAgentType == "SELF").ToList();
        return items.Count > 0 ? Math.Round(items.Average(r => r.Duration), 1) : 0.0;
    }).ToList();

    var outsourcedAvg = serviceTypes.Select(s =>
    {
        var items = perService.Where(r => r.Service == s && r.PrmAgentType == "OUTSOURCED").ToList();
        return items.Count > 0 ? Math.Round(items.Average(r => r.Duration), 1) : 0.0;
    }).ToList();

    _logger.LogInformation("Duration by agent type for {Slug}/{Airport}: {Types} service types",
        tenantSlug, filters.Airport, serviceTypes.Count);

    return new DurationByAgentTypeResponse(serviceTypes, selfAvg, outsourcedAvg);
}
```

- [ ] **Step 2: Add controller endpoint in PerformanceController.cs**

Add after the `GetPauseAnalysis` method:

```csharp
[HttpGet("duration-by-agent-type")]
public async Task<IActionResult> GetDurationByAgentType([FromQuery] PrmFilterParams filters, CancellationToken ct)
{
    var slug = GetTenantSlug();
    var result = await _performanceService.GetDurationByAgentTypeAsync(slug, filters, ct);
    return Ok(result);
}
```

- [ ] **Step 3: Build to verify**

Run: `cd backend && dotnet build`
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add backend/src/PrmDashboard.PrmService/Services/PerformanceService.cs backend/src/PrmDashboard.PrmService/Controllers/PerformanceController.cs
git commit -m "feat(api): add GET /api/prm/performance/duration-by-agent-type endpoint"
```

---

### Task 4: Frontend DTOs and API Methods

**Files:**
- Modify: `frontend/src/app/features/dashboard/services/prm-dtos.ts`
- Modify: `frontend/src/app/features/dashboard/services/prm-data.service.ts`

- [ ] **Step 1: Add TypeScript interfaces to prm-dtos.ts**

Append after `RouteBreakdownResponse`:

```typescript
export interface AgentServiceMatrixResponse {
  agents: string[];
  agentNames: string[];
  serviceTypes: string[];
  values: number[][];
}
```

Append after `PauseAnalysisResponse`:

```typescript
export interface DurationByAgentTypeResponse {
  serviceTypes: string[];
  self: number[];
  outsourced: number[];
}
```

- [ ] **Step 2: Add imports and API methods to prm-data.service.ts**

Add to the import block from `'./prm-dtos'`:

```typescript
AgentServiceMatrixResponse,
DurationByAgentTypeResponse,
```

Add to the class body after `pauseAnalysis()`:

```typescript
// Insights
agentServiceMatrix(limit = 10): Observable<AgentServiceMatrixResponse> {
  return this.api.get<AgentServiceMatrixResponse>('/prm/breakdowns/agent-service-matrix', this.params({ limit }));
}
durationByAgentType(): Observable<DurationByAgentTypeResponse> {
  return this.api.get<DurationByAgentTypeResponse>('/prm/performance/duration-by-agent-type', this.params());
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd frontend && npx ng build --configuration development 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/dashboard/services/prm-dtos.ts frontend/src/app/features/dashboard/services/prm-data.service.ts
git commit -m "feat(frontend): add DTOs and API methods for insights tab"
```

---

### Task 5: Extend BarChartComponent for Grouped Bars

**Files:**
- Modify: `frontend/src/app/shared/charts/bar-chart/bar-chart.component.ts`

- [ ] **Step 1: Add grouped bar support**

Add a new input for the second series and its label/color. Modify the `chartOptions` computed to render two series when `series2` is provided.

Add inputs after `barClick`:

```typescript
series2 = input<BarDatum[]>([]);
seriesName = input<string>('');
series2Name = input<string>('');
series2Color = input<string>('#fb8c00');
```

Replace the `series` array inside `chartOptions` computed. Change the full return block to:

```typescript
chartOptions = computed<EChartsOption>(() => {
  const d = this.data();
  const d2 = this.series2();
  const names = d.map((x) => x.label);
  const values = d.map((x) => ({
    value: x.value,
    itemStyle: x.color ? { color: x.color } : undefined,
  }));

  const categoryAxis = {
    ...CHART_CATEGORY_AXIS,
    data: names,
    axisLabel: { ...CHART_CATEGORY_AXIS.axisLabel, rotate: 0 },
  };
  const valueAxis = { ...CHART_VALUE_AXIS };

  const isGrouped = d2.length > 0;

  const chartSeries: any[] = [
    {
      name: this.seriesName() || undefined,
      type: 'bar',
      data: values,
      barMaxWidth: isGrouped ? 20 : 32,
      itemStyle: {
        color: CHART_COLORS.accent,
        borderRadius: this.horizontal() ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      emphasis: {
        itemStyle: { color: CHART_COLORS.accentHover },
      },
      animationDuration: 400,
      animationEasing: 'cubicOut',
    },
  ];

  if (isGrouped) {
    chartSeries.push({
      name: this.series2Name() || undefined,
      type: 'bar',
      data: d2.map((x) => ({
        value: x.value,
        itemStyle: x.color ? { color: x.color } : undefined,
      })),
      barMaxWidth: 20,
      itemStyle: {
        color: this.series2Color(),
        borderRadius: this.horizontal() ? [0, 3, 3, 0] : [3, 3, 0, 0],
      },
      emphasis: {
        itemStyle: { color: this.series2Color() },
      },
      animationDuration: 400,
      animationEasing: 'cubicOut',
    });
  }

  return {
    ...CHART_BASE,
    grid: { ...CHART_BASE.grid, bottom: this.horizontal() ? 32 : 56 },
    xAxis: this.horizontal() ? valueAxis : categoryAxis,
    yAxis: this.horizontal() ? categoryAxis : valueAxis,
    series: chartSeries,
  } as EChartsOption;
});
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx ng build --configuration development 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/charts/bar-chart/bar-chart.component.ts
git commit -m "feat(charts): add grouped bar support to BarChartComponent"
```

---

### Task 6: Insights Tab Component

**Files:**
- Create: `frontend/src/app/features/dashboard/tabs/insights/insights.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/insights/insights.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/insights/insights.component.scss`

- [ ] **Step 1: Create insights.component.ts**

```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, forkJoin, switchMap } from 'rxjs';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card.component';
import { BarChartComponent, BarDatum } from '../../../../shared/charts/bar-chart/bar-chart.component';
import { HorizontalBarChartComponent } from '../../../../shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { HeatmapChartComponent, HeatmapCell } from '../../../../shared/charts/heatmap-chart/heatmap-chart.component';
import { LineChartComponent, LineSeries } from '../../../../shared/charts/line-chart/line-chart.component';
import { PrmDataService } from '../../services/prm-data.service';
import { FilterStore } from '../../../../core/store/filter.store';
import { ToastService } from '../../../../core/toast/toast.service';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [
    CommonModule, KpiCardComponent, BarChartComponent,
    HorizontalBarChartComponent, HeatmapChartComponent, LineChartComponent,
  ],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss',
})
export class InsightsComponent {
  private data = inject(PrmDataService);
  private toast = inject(ToastService);
  filters = inject(FilterStore);

  loading = signal(true);

  // KPIs
  pauseRate = signal<number>(0);
  outsourcedPct = signal<number>(0);
  avgPerAgent = signal<number>(0);
  noShowRate = signal<number>(0);

  // Section 1: Agent Performance
  agentWorkload = signal<BarDatum[]>([]);
  matrixCells = signal<HeatmapCell[]>([]);
  matrixXLabels = signal<string[]>([]);
  matrixYLabels = signal<string[]>([]);

  // Section 2: Operational Patterns
  hourlyHeatCells = signal<HeatmapCell[]>([]);
  hourlyXLabels = signal<string[]>([]);
  hourlyYLabels = signal<string[]>([]);
  durationSelfBars = signal<BarDatum[]>([]);
  durationOutBars = signal<BarDatum[]>([]);

  // Section 3: Strategic Trends
  monthlyTrendSeries = signal<LineSeries[]>([]);
  noShowBars = signal<BarDatum[]>([]);

  constructor() {
    toObservable(this.filters.queryParams).pipe(
      switchMap(() => {
        if (!this.filters.airport() || !this.filters.dateFrom()) {
          return EMPTY;
        }
        this.loading.set(true);
        return forkJoin({
          pause: this.data.pauseAnalysis(),
          handling: this.data.handlingDistribution(),
          kpis: this.data.kpisSummary(),
          noShows: this.data.noShows(),
          agents: this.data.topAgents(10),
          matrix: this.data.agentServiceMatrix(10),
          hourly: this.data.trendsHourly(),
          durByType: this.data.durationByAgentType(),
          monthly: this.data.trendsMonthly(),
        });
      }),
      takeUntilDestroyed(),
    ).subscribe({
      next: (r: any) => {
        // KPIs
        this.pauseRate.set(r.pause.pauseRate ?? 0);
        const hLabels: string[] = r.handling.labels ?? [];
        const hValues: number[] = r.handling.values ?? [];
        const total = hValues.reduce((a: number, b: number) => a + b, 0) || 1;
        const outIdx = hLabels.findIndex((l: string) => l.toUpperCase().startsWith('OUT'));
        this.outsourcedPct.set(outIdx >= 0 ? (hValues[outIdx] / total) * 100 : 0);
        this.avgPerAgent.set(
          r.kpis.totalAgents > 0
            ? Math.round((r.kpis.totalPrm / r.kpis.totalAgents) * 10) / 10
            : 0
        );
        const noShowTotal = (r.noShows.items ?? []).reduce((s: number, i: any) => s + i.total, 0) || 1;
        const noShowCount = (r.noShows.items ?? []).reduce((s: number, i: any) => s + i.noShows, 0);
        this.noShowRate.set(Math.round((noShowCount / noShowTotal) * 1000) / 10);

        // Agent Workload (horizontal bar)
        this.agentWorkload.set((r.agents.items ?? []).map((a: any) => ({
          label: a.agentName ?? a.agentNo,
          value: a.prmCount,
          color: a.topService === 'OUTSOURCED' ? '#fb8c00' : '#1d4ed8',
        })));

        // Agent Specialization Matrix (heatmap)
        const mAgents: string[] = r.matrix.agentNames ?? r.matrix.agents ?? [];
        const mTypes: string[] = r.matrix.serviceTypes ?? [];
        const mValues: number[][] = r.matrix.values ?? [];
        const cells: HeatmapCell[] = [];
        for (let ai = 0; ai < mAgents.length; ai++) {
          for (let si = 0; si < mTypes.length; si++) {
            cells.push({ x: mTypes[si], y: mAgents[ai], value: mValues[ai]?.[si] ?? 0 });
          }
        }
        this.matrixCells.set(cells);
        this.matrixXLabels.set(mTypes);
        this.matrixYLabels.set(mAgents);

        // Hourly Demand Heatmap
        const days: string[] = r.hourly.days ?? [];
        const hours: number[] = r.hourly.hours ?? [];
        const hVals: number[][] = r.hourly.values ?? [];
        const hourLabels = hours.map((h: number) => `${String(h).padStart(2, '0')}:00`);
        const hourlyCells: HeatmapCell[] = [];
        for (let di = 0; di < days.length; di++) {
          for (let hi = 0; hi < hours.length; hi++) {
            hourlyCells.push({ x: hourLabels[hi], y: days[di], value: hVals[di]?.[hi] ?? 0 });
          }
        }
        this.hourlyHeatCells.set(hourlyCells);
        this.hourlyXLabels.set(hourLabels);
        this.hourlyYLabels.set(days);

        // Self vs Outsourced Duration (grouped bars)
        const durTypes: string[] = r.durByType.serviceTypes ?? [];
        const selfVals: number[] = r.durByType.self ?? [];
        const outVals: number[] = r.durByType.outsourced ?? [];
        this.durationSelfBars.set(durTypes.map((t: string, i: number) => ({ label: t, value: selfVals[i] ?? 0 })));
        this.durationOutBars.set(durTypes.map((t: string, i: number) => ({ label: t, value: outVals[i] ?? 0 })));

        // Monthly Volume Trend
        const months: string[] = r.monthly.months ?? [];
        const mVals: number[] = r.monthly.values ?? [];
        this.monthlyTrendSeries.set([{
          name: 'Services',
          type: 'area',
          data: months.map((m: string, i: number) => [m, mVals[i] ?? 0] as [string, number]),
          color: '#1d4ed8',
        }]);

        // No-Show by Airline
        this.noShowBars.set((r.noShows.items ?? [])
          .filter((ns: any) => ns.noShows > 0)
          .slice(0, 10)
          .map((ns: any) => ({
            label: ns.airline,
            value: ns.rate,
            color: ns.rate > 5 ? '#b91c1c' : ns.rate >= 3 ? '#b45309' : '#047857',
          })));

        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onAgentClick(label: string): void {
    if (!label) return;
    this.toast.show(`Agent: ${label}`);
  }

  onNoShowAirlineClick(code: string): void {
    if (!code) return;
    this.filters.setAirline([code]);
    this.toast.show(`Filtered by airline: ${code}`);
  }

  onMonthClick(month: string): void {
    if (!month) return;
    this.toast.show(`Month: ${month}`);
  }
}
```

- [ ] **Step 2: Create insights.component.html**

```html
<div class="insights-content">
  <!-- Row 1: 4 KPI cards -->
  <div class="row row-kpis">
    <app-kpi-card
      label="Pause Rate"
      [value]="((pauseRate() | number:'1.1-1') ?? '') + '%'"
      accent="amber"
      [loading]="loading()"></app-kpi-card>
    <app-kpi-card
      label="Outsourced Services"
      [value]="((outsourcedPct() | number:'1.1-1') ?? '') + '%'"
      accent="plum"
      [loading]="loading()"></app-kpi-card>
    <app-kpi-card
      label="Avg Services per Agent"
      [value]="(avgPerAgent() | number:'1.1-1') ?? ''"
      accent="blue"
      [loading]="loading()"></app-kpi-card>
    <app-kpi-card
      label="No-Show Rate"
      [value]="((noShowRate() | number:'1.1-1') ?? '') + '%'"
      accent="teal"
      [loading]="loading()"></app-kpi-card>
  </div>

  <!-- Section 1: Agent Performance -->
  <div class="section-label">Agent Performance</div>
  <div class="row row-charts-6-4">
    <app-horizontal-bar-chart
      title="Agent Workload"
      subtitle="Services handled per agent"
      [data]="agentWorkload()"
      [loading]="loading()"
      xLabel="Services"
      yLabel="Agent"
      (barClick)="onAgentClick($event)"></app-horizontal-bar-chart>
    <app-heatmap-chart
      title="Agent Specialization"
      subtitle="Which agents handle which service types"
      [cells]="matrixCells()"
      [xLabels]="matrixXLabels()"
      [yLabels]="matrixYLabels()"
      [loading]="loading()"></app-heatmap-chart>
  </div>

  <!-- Section 2: Operational Patterns -->
  <div class="section-label">Operational Patterns</div>
  <div class="row row-charts-6-4">
    <app-heatmap-chart
      title="Hourly Demand"
      subtitle="When PRM services peak by day and hour"
      [cells]="hourlyHeatCells()"
      [xLabels]="hourlyXLabels()"
      [yLabels]="hourlyYLabels()"
      [loading]="loading()"></app-heatmap-chart>
    <app-bar-chart
      title="Self vs Outsourced Duration"
      subtitle="Average service time by handling type (minutes)"
      [data]="durationSelfBars()"
      [series2]="durationOutBars()"
      seriesName="Self"
      series2Name="Outsourced"
      series2Color="#fb8c00"
      [loading]="loading()"
      xLabel="Service Type"
      yLabel="Avg Minutes"></app-bar-chart>
  </div>

  <!-- Section 3: Strategic Trends -->
  <div class="section-label">Strategic Trends</div>
  <div class="row row-charts-6-4">
    <app-line-chart
      title="Monthly Volume"
      subtitle="Service count trend over time"
      [series]="monthlyTrendSeries()"
      [loading]="loading()"
      [showAvgLine]="true"
      (pointClick)="onMonthClick($event)"></app-line-chart>
    <app-bar-chart
      title="No-Show Rate by Airline"
      subtitle="Passengers who booked PRM but didn't show up (%)"
      [data]="noShowBars()"
      [loading]="loading()"
      xLabel="Airline"
      yLabel="Rate %"
      (barClick)="onNoShowAirlineClick($event)"></app-bar-chart>
  </div>
</div>
```

- [ ] **Step 3: Create insights.component.scss**

```scss
.insights-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.row { display: grid; gap: 16px; }

.row-kpis {
  grid-template-columns: repeat(4, 1fr);
}

.row-charts-6-4 {
  grid-template-columns: 3fr 2fr;
  min-height: 320px;
}

.section-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  padding-top: 8px;
}

@media (max-width: 1200px) {
  .row-kpis { grid-template-columns: repeat(2, 1fr); }
  .row-charts-6-4 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx ng build --configuration development 2>&1 | head -20`
Expected: No errors (component not wired to routing yet, but should compile).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/dashboard/tabs/insights/
git commit -m "feat(frontend): add Insights tab component with 4 KPIs and 6 charts"
```

---

### Task 7: Wire Insights Tab into Dashboard

**Files:**
- Modify: `frontend/src/app/features/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/features/dashboard/dashboard.component.html`

- [ ] **Step 1: Update dashboard.component.ts**

Add import at the top with the other tab imports:

```typescript
import { InsightsComponent } from './tabs/insights/insights.component';
```

Update `TAB_NAMES`:

```typescript
const TAB_NAMES = ['Overview', 'Top 10', 'Service Breakup', 'Fulfillment', 'Insights'];
```

Add `InsightsComponent` to the `imports` array in the `@Component` decorator:

```typescript
imports: [CommonModule, MatTabsModule, TopBarComponent, FilterBarComponent,
          OverviewComponent, Top10Component, ServiceBreakupComponent, FulfillmentComponent, InsightsComponent],
```

- [ ] **Step 2: Update dashboard.component.html**

Add the 5th tab after the Fulfillment tab (before `</mat-tab-group>`):

```html
    <mat-tab label="Insights">
      @if (activeTab() === 4) { <app-insights /> }
    </mat-tab>
```

- [ ] **Step 3: Verify full build**

Run: `cd frontend && npx ng build --configuration development 2>&1 | head -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/dashboard/dashboard.component.ts frontend/src/app/features/dashboard/dashboard.component.html
git commit -m "feat(dashboard): wire Insights as 5th tab"
```

---

### Task 8: Docker Build and Verify

**Files:** No new files — integration verification.

- [ ] **Step 1: Rebuild and run all containers**

```bash
docker compose up --build -d
```

Wait for all services to start. Verify no build errors.

- [ ] **Step 2: Verify new backend endpoints respond**

After MySQL reports healthy (~30s):

```bash
# Login to get a token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: aeroground" \
  -d '{"employeeNo":"EMP001","password":"password123"}' | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Test agent-service-matrix
curl -s http://localhost:5000/api/prm/breakdowns/agent-service-matrix?airport=BLR\&date_from=2025-12-01\&date_to=2026-03-31 \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: aeroground" | python -m json.tool | head -20

# Test duration-by-agent-type
curl -s http://localhost:5000/api/prm/performance/duration-by-agent-type?airport=BLR\&date_from=2025-12-01\&date_to=2026-03-31 \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: aeroground" | python -m json.tool | head -20
```

Expected: Both return JSON with populated arrays, not empty/error.

- [ ] **Step 3: Open browser and verify Insights tab**

Navigate to the dashboard in the browser. The 5th "Insights" tab should be visible. Click it and verify:
- 4 KPI cards show values
- Agent Workload horizontal bar chart renders
- Agent Specialization heatmap renders
- Hourly Demand heatmap renders
- Self vs Outsourced grouped bars render
- Monthly Volume line chart renders
- No-Show Rate bar chart renders

- [ ] **Step 4: Commit any fixes needed**

If any issues found during verification, fix and commit.
