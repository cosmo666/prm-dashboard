# Angular 8 + PrimeNG Rewrite — Phase 3 (Service Breakup Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the third dashboard tab. Three sections under `/dashboard/service-breakup` — a Sankey diagram of Agent Type → Service → Flight, a stacked vertical bar of service mix over time, and a top-routes table.

**Reference spec:** [docs/superpowers/specs/2026-05-06-phase-3-service-breakup-tab.md](../specs/2026-05-06-phase-3-service-breakup-tab.md). Where the spec specifies behavior, types, or design tokens, this plan refers to spec sections rather than re-printing.

**Builds on:** Phase 1 + Phase 2 plans. All standing rules still apply (dev container, TS 3.4.5 quirks, NgModules + function-form `loadChildren`, `.ui-*` PrimeNG selectors, Co-Authored-By trailer).

---

## Standing rules

Inherited from Phase 1 plan §"Standing rules". Most-violated in practice:

1. **Dev container only:** `docker compose run --rm frontend-dev <cmd>`.
2. **No `?.`, `??`, `import type`, `satisfies`, `padStart`** — TS 3.4.5.
3. **`TestBed.get(...)` not `TestBed.inject`** — Angular 8.
4. **Read backend C# DTO before writing TS interface** — `BreakdownDtos.cs` is authoritative.
5. **Use `params.key` not `params['key']`** — TSLint's object-literal-shorthand-access.
6. **Commit trailer line:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Tasks (T0–T6)

### Task 0: Read backend DTOs + BreakdownsController (5 min, no code)

Skim and confirm:
- `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs` — `SankeyNode`, `SankeyLink`, `SankeyResponse`, `ServiceTypeMatrixRow`, `ServiceTypeMatrixResponse`, `RouteItem`, `RouteBreakdownResponse`. The DTOs from spec [§4](../specs/2026-05-06-phase-3-service-breakup-tab.md#4-backend-reality) should match exactly.
- `backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs` — endpoints `[HttpGet("by-agent-type")]`, `[HttpGet("by-service-type")]`, `[HttpGet("by-route")]`. All accept `[FromQuery] PrmFilterParams filters`. Routes endpoint accepts `[FromQuery] int limit = 10`.

If C# field names differ from the TS shapes in spec §4: the C# wins; flag the drift.

No commit.

---

### Task 1: Extend DTOs + PrmDataService

**Files:**
- Modify: `frontend/src/app/features/dashboard/services/prm-dtos.ts`
- Modify: `frontend/src/app/features/dashboard/services/prm-data.service.ts`
- Modify: `frontend/src/app/features/dashboard/services/prm-data.service.spec.ts`

**Step 1 — `prm-dtos.ts` additions:**

Append to the existing file (after the agent-ranking interfaces from Phase 2):

```ts
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface SankeyNode { name: string; value: number; }
export interface SankeyLink { source: string; target: string; value: number; }
export interface SankeyResponse { nodes: SankeyNode[]; links: SankeyLink[]; }

// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface ServiceTypeMatrixRow {
  monthYear: string;
  serviceCounts: { [service: string]: number };
  total: number;
}
export interface ServiceTypeMatrixResponse {
  serviceTypes: string[];
  rows: ServiceTypeMatrixRow[];
}

// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs
export interface RouteItem {
  departure: string;
  arrival: string;
  count: number;
  percentage: number;
}
export interface RouteBreakdownResponse { items: RouteItem[]; }
```

**Step 2 — `prm-data.service.ts` additions:**

Add to existing imports from `./prm-dtos`:
```ts
SankeyResponse,
ServiceTypeMatrixResponse,
RouteBreakdownResponse,
```

Add three new methods (placement: at the end of the class body, after `filterOptions`):

```ts
serviceBreakupSankey(): Observable<SankeyResponse> {
  return this.api.get<SankeyResponse>('/prm/breakdowns/by-agent-type', this.params());
}

serviceTypeMatrix(): Observable<ServiceTypeMatrixResponse> {
  return this.api.get<ServiceTypeMatrixResponse>('/prm/breakdowns/by-service-type', this.params());
}

topRoutes(limit: number = 10): Observable<RouteBreakdownResponse> {
  return this.api.get<RouteBreakdownResponse>('/prm/breakdowns/by-route', this.params({ limit }));
}
```

**Step 3 — spec test additions:**

Three new tests inside the existing describe block:

```ts
it('serviceBreakupSankey calls /prm/breakdowns/by-agent-type with the filter params', () => {
  service.serviceBreakupSankey().subscribe();
  const args = apiSpy.get.calls.mostRecent().args;
  expect(args[0]).toBe('/prm/breakdowns/by-agent-type');
});

it('serviceTypeMatrix calls /prm/breakdowns/by-service-type', () => {
  service.serviceTypeMatrix().subscribe();
  const args = apiSpy.get.calls.mostRecent().args;
  expect(args[0]).toBe('/prm/breakdowns/by-service-type');
});

it('topRoutes passes limit to /prm/breakdowns/by-route', () => {
  service.topRoutes(5).subscribe();
  const args = apiSpy.get.calls.mostRecent().args;
  expect(args[0]).toBe('/prm/breakdowns/by-route');
  const params = args[1] as { [key: string]: string };
  expect(params.limit).toBe('5');
});
```

**Step 4 — verify + commit:**

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
```

All clean. Tests should now be at 86 (was 83 + 3 service-method tests).

```bash
git add frontend/src/app/features/dashboard/services
git commit -m "$(cat <<'EOF'
feat(dashboard): serviceBreakupSankey/serviceTypeMatrix/topRoutes data methods

Adds 3 PrmDataService methods + 7 DTO interfaces for the Phase 3
Service Breakup tab. SankeyResponse from /breakdowns/by-agent-type
(3-stage flow: agent type → service → flight), ServiceTypeMatrixResponse
from /breakdowns/by-service-type (months × service-type counts),
RouteBreakdownResponse from /breakdowns/by-route.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SankeyChartComponent

**Files:**
- Create: `frontend/src/app/shared/charts/sankey-chart/sankey-chart.component.ts`
- Create: `frontend/src/app/shared/charts/sankey-chart/sankey-chart.component.html`
- Create: `frontend/src/app/shared/charts/sankey-chart/sankey-chart.component.spec.ts`
- Modify: `frontend/src/app/shared/shared.module.ts` (declare + export SankeyChartComponent)

**Step 1 — Component:**

Use the verbatim TS from spec §6:

```ts
import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

export interface SankeyChartNode { name: string; }
export interface SankeyChartLink { source: string; target: string; value: number; }

@Component({
  selector: 'app-sankey-chart',
  templateUrl: './sankey-chart.component.html',
})
export class SankeyChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() nodes: SankeyChartNode[] = [];
  @Input() links: SankeyChartLink[] = [];
  @Input() loading = false;
  @Input() height = 480;

  @Output() nodeClick = new EventEmitter<string>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    if (!this.nodes.length || !this.links.length) { this.options = null; return; }
    const primary = resolvePrimary();
    this.options = {
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [{
        type: 'sankey',
        data: this.nodes.map(n => ({ name: n.name })),
        links: this.links,
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        layoutIterations: 32,
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.5 },
        itemStyle: { color: primary, borderColor: primary },
        label: { color: '#0f172a', fontSize: 12 },
      } as any],
    };
  }

  onChartClick(event: any): void {
    if (!event) { return; }
    if (event.dataType === 'node' && event.name) {
      this.nodeClick.emit(event.name);
    }
  }
}
```

**Step 2 — Template:**

```html
<app-base-chart [title]="title" [loading]="loading" [options]="options" [height]="height"
                (chartClick)="onChartClick($event)"></app-base-chart>
```

**Step 3 — Spec test:**

```ts
import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { SankeyChartComponent } from './sankey-chart.component';

describe('SankeyChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SankeyChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds sankey options when nodes and links are non-empty', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    fixture.componentInstance.nodes = [{ name: 'Self' }, { name: 'WCHR' }, { name: 'AI102' }];
    fixture.componentInstance.links = [
      { source: 'Self', target: 'WCHR', value: 10 },
      { source: 'WCHR', target: 'AI102', value: 5 },
    ];
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(opts).toBeTruthy();
    expect(opts.series[0].type).toBe('sankey');
    expect(opts.series[0].data.length).toBe(3);
    expect(opts.series[0].links.length).toBe(2);
  });

  it('options is null when nodes or links are empty', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    fixture.componentInstance.nodes = [];
    fixture.componentInstance.links = [];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeNull();
  });

  it('emits nodeClick on a node click event (OQ-P3-3)', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    let captured = '';
    fixture.componentInstance.nodeClick.subscribe((name: string) => { captured = name; });
    fixture.componentInstance.onChartClick({ dataType: 'node', name: 'WCHR' });
    expect(captured).toBe('WCHR');
  });

  it('does not emit nodeClick on a link click', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    const spy = jasmine.createSpy('nodeClick');
    fixture.componentInstance.nodeClick.subscribe(spy);
    fixture.componentInstance.onChartClick({ dataType: 'edge', source: 'Self', target: 'WCHR' });
    expect(spy).not.toHaveBeenCalled();
  });
});
```

**Step 4 — SharedModule:**

Add `SankeyChartComponent` to `imports`/`declarations`/`exports` of `SharedModule`. Pattern same as the other chart wrappers.

**Step 5 — Verify + commit:**

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/shared/charts/sankey-chart frontend/src/app/shared/shared.module.ts
git commit -m "$(cat <<'EOF'
feat(charts): add SankeyChartComponent (Agent Type → Service → Flight)

Wraps echarts 4 sankey via BaseChartComponent. nodeAlign='left',
emphasis.focus='adjacency' for click highlighting, 32 layout
iterations for stable node positioning. v4 sankey gradients are
flatter than v5 — accepted per project memory frontend_version_pins.

OQ-P3-3 drill-down: nodeClick emits the node name when echarts'
event.dataType === 'node'. Link clicks are intentionally no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: BarChartComponent stacked extension

**Files:**
- Modify: `frontend/src/app/shared/charts/bar-chart/bar-chart.component.ts`
- Modify: `frontend/src/app/shared/charts/bar-chart/bar-chart.component.spec.ts`

**Step 1 — Read the current state:**

Open `bar-chart.component.ts`. The Phase 0 baseline has `@Input() data: BarDatum[]`, `@Input() title`, `@Input() loading`, `@Input() height`, builds an `EChartOption` with a single vertical-bar series. Confirm the existing shape before editing.

**Step 2 — Add new inputs:**

```ts
@Input() data: BarDatum[] = [];                          // existing — x-axis labels
@Input() stackedSeries?: { [code: string]: number[] };   // NEW
@Input() stackKeys?: string[];                           // NEW — preserves order
@Input() stackColors?: { [code: string]: string };       // NEW — per-series color override
```

**Step 3 — Update `ngOnChanges`:**

```ts
ngOnChanges(): void {
  const labels = this.data.map(d => d.label);
  const stacked = this.stackedSeries || {};
  const keys = this.stackKeys || Object.keys(stacked);
  const colors = this.stackColors || {};
  const hasStacked = keys.length > 0;

  const series: any[] = hasStacked
    ? keys.map(k => ({
        name: k,
        type: 'bar',
        stack: 'mix',
        data: stacked[k] || [],
        itemStyle: { color: colors[k] || resolvePrimary() },
        emphasis: { focus: 'series' },
      }))
    : [{
        name: 'Total',
        type: 'bar',
        data: this.data.map(d => d.value),
        itemStyle: { color: resolvePrimary() },
        emphasis: { focus: 'series' },
      }];

  this.options = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend:  hasStacked ? { data: keys, bottom: 0 } : undefined,
    grid:    { left: 40, right: 20, top: 20, bottom: hasStacked ? 50 : 30 },
    xAxis:   { type: 'category', data: labels },
    yAxis:   { type: 'value' },
    series,
  };
}
```

Single-series mode (the Phase 0 default for the smoke page) is unchanged when `stackedSeries` is undefined.

**Step 4 — Add tests:**

Two new tests:

```ts
it('renders single series when stackedSeries is undefined (Phase 0 default)', () => {
  const fixture = TestBed.createComponent(BarChartComponent);
  fixture.componentInstance.data = [{ label: 'A', value: 10 }, { label: 'B', value: 20 }];
  fixture.componentInstance.ngOnChanges();
  const opts = fixture.componentInstance.options as any;
  expect(opts.series.length).toBe(1);
  expect(opts.legend).toBeUndefined();
});

it('renders stacked series when stackedSeries is provided (OQ-P3-4)', () => {
  const fixture = TestBed.createComponent(BarChartComponent);
  fixture.componentInstance.data = [{ label: '2026-02', value: 0 }, { label: '2026-03', value: 0 }];
  fixture.componentInstance.stackedSeries = {
    WCHR: [40, 60],
    WCHC: [10, 15],
  };
  fixture.componentInstance.stackKeys = ['WCHR', 'WCHC'];
  fixture.componentInstance.stackColors = { WCHR: '#2563EB', WCHC: '#1e3a8a' };
  fixture.componentInstance.ngOnChanges();
  const opts = fixture.componentInstance.options as any;
  expect(opts.series.length).toBe(2);
  expect(opts.series[0].stack).toBe('mix');
  expect(opts.series[1].stack).toBe('mix');
  expect(opts.series[0].itemStyle.color).toBe('#2563EB');
  expect(opts.legend.data).toEqual(['WCHR', 'WCHC']);
});
```

**Step 5 — Verify + commit:**

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/shared/charts/bar-chart
git commit -m "$(cat <<'EOF'
feat(charts): BarChartComponent supports stacked vertical bars

Optional [stackedSeries] input renders one series per key, all sharing
stack='mix' (echarts 4 stacking primitive). [stackKeys] preserves
order (Object.keys() doesn't guarantee insertion order on older JS
engines that polyfills target). [stackColors] lets the caller pass a
per-series palette — Phase 3's Service Mix Over Time chart uses it
to map IATA SSR codes to fixed hues.

Single-series usage from Phase 0's smoke page is unchanged when
[stackedSeries] is undefined.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ServiceBreakupTabComponent + Sankey-cap helper

**Files:**
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup-tab.component.ts`
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup-tab.component.html`
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup-tab.component.scss`
- Create: `frontend/src/app/features/dashboard/tabs/service-breakup/service-breakup-tab.component.spec.ts`

**Step 1 — Component TS:**

Use the verbatim TS from spec §8 (with imports). The `capSankeyFlights` private method:

```ts
private capSankeyFlights(raw: SankeyResponse, n: number): SankeyResponse {
  // Identify which nodes are flights vs service codes vs agent types.
  // Heuristic: a node is a flight if it appears as a TARGET in any link
  // whose source is a service code (i.e. it's stage 3 in the flow).
  const sourceNames = new Set<string>(raw.links.map(l => l.source));
  const flightNodes = raw.nodes.filter(n2 => !sourceNames.has(n2.name));   // never a source = leaf
  if (flightNodes.length <= n) {
    return raw;   // already small enough
  }

  // Sort flights by total inbound link weight, keep top n
  const inflow: { [name: string]: number } = {};
  for (const link of raw.links) {
    if (!sourceNames.has(link.target)) {                                     // target is a leaf flight
      inflow[link.target] = (inflow[link.target] || 0) + link.value;
    }
  }
  const sorted = Object.keys(inflow).sort((a, b) => inflow[b] - inflow[a]);
  const keepFlights = new Set(sorted.slice(0, n));
  const dropFlights = new Set(sorted.slice(n));

  if (dropFlights.size === 0) { return raw; }

  // Build new node list: keep all non-flight nodes, keep the kept flights, add "Other flights"
  const otherTotal = Array.from(dropFlights).reduce((sum, f) => sum + (inflow[f] || 0), 0);
  const newNodes: SankeyNode[] = [
    ...raw.nodes.filter(nd => !dropFlights.has(nd.name)),
    { name: 'Other flights', value: otherTotal },
  ];

  // Build new link list: kept-flight links unchanged; dropped-flight links collapsed onto "Other flights"
  const collapsed: { [src: string]: number } = {};
  const newLinks: SankeyLink[] = [];
  for (const link of raw.links) {
    if (!dropFlights.has(link.target)) {
      newLinks.push(link);
    } else {
      collapsed[link.source] = (collapsed[link.source] || 0) + link.value;
    }
  }
  for (const src of Object.keys(collapsed)) {
    newLinks.push({ source: src, target: 'Other flights', value: collapsed[src] });
  }

  return { nodes: newNodes, links: newLinks };
}
```

**Step 2 — Template:**

Verbatim from spec §9. One adjustment: the inline `{{ routes.length }}` reference in the routes section subtitle won't work as written (no `routes` field on the component). Either drop that detail or use `{{ ((routes$ | async) || []).length }}`.

Cleaner: drop the routes count reference; the subtitle just reads "Top 10 routes by PRM service count".

**Step 3 — SCSS:**

Mirror the Phase 2 `top10-tab.component.scss` styling — `.sb`, `.sb-section`, `.sb-section__head/__title/__sub`, plus a `:host ::ng-deep .routes-table` block for the PrimeNG p-table styling. Reuse the same right-aligned mono-numeric pattern.

```scss
:host { display: block; }

.sb { padding: 16px 0; }

.sb-section {
  background: var(--app-surface, #fff);
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  transition: box-shadow 120ms ease;

  &:hover { box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06); }
  &:last-child { margin-bottom: 0; }

  &__head { margin-bottom: 12px; }
  &__title { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--app-text, #0f172a); }
  &__sub { margin: 0; font-size: 12px; color: var(--app-text-muted, #64748b); }
}

:host ::ng-deep .routes-table {
  /* same .ui-table-thead / .ui-table-tbody styling as agents-table */
  /* the simpler 4-col table shouldn't need .agent-name overflow rules */
}
```

(Copy the full table styling from Phase 2's `top10-tab.component.scss`. Drop `.agent-name`, `.muted` if not used.)

**Step 4 — Spec test:**

```ts
describe('ServiceBreakupTabComponent', () => {
  let fixture: ComponentFixture<ServiceBreakupTabComponent>;
  let toggleServiceSpy: jasmine.Spy;
  let toggleFlightSpy: jasmine.Spy;
  let setHandledBySpy: jasmine.Spy;

  beforeEach(() => {
    toggleServiceSpy = jasmine.createSpy('toggleService');
    toggleFlightSpy  = jasmine.createSpy('toggleFlight');
    setHandledBySpy  = jasmine.createSpy('setHandledBy');

    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [], dateFromSnapshot: '',
      toggleService: toggleServiceSpy,
      toggleFlight: toggleFlightSpy,
      setHandledBy: setHandledBySpy,
    };
    const dataStub = {
      serviceBreakupSankey: () => of({ nodes: [], links: [] }),
      serviceTypeMatrix:    () => of({ serviceTypes: [], rows: [] }),
      topRoutes:            () => of({ items: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [ServiceBreakupTabComponent],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(ServiceBreakupTabComponent);
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('onSankeyNodeClick routes "Self" to setHandledBy', () => {
    fixture.componentInstance.onSankeyNodeClick('Self');
    expect(setHandledBySpy).toHaveBeenCalledWith(['SELF']);
  });

  it('onSankeyNodeClick routes a service code to toggleService', () => {
    fixture.componentInstance.monthlyMixKeys$.next(['WCHR', 'WCHC']);
    fixture.componentInstance.onSankeyNodeClick('WCHR');
    expect(toggleServiceSpy).toHaveBeenCalledWith('WCHR');
  });

  it('onSankeyNodeClick routes an unknown name to toggleFlight (default)', () => {
    fixture.componentInstance.monthlyMixKeys$.next(['WCHR']);
    fixture.componentInstance.onSankeyNodeClick('AI102');
    expect(toggleFlightSpy).toHaveBeenCalledWith('AI102');
  });

  it('onSankeyNodeClick ignores "Other flights" pseudo-node', () => {
    fixture.componentInstance.onSankeyNodeClick('Other flights');
    expect(toggleFlightSpy).not.toHaveBeenCalled();
    expect(toggleServiceSpy).not.toHaveBeenCalled();
    expect(setHandledBySpy).not.toHaveBeenCalled();
  });
});
```

**Step 5 — Verify + commit:**

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/features/dashboard/tabs/service-breakup
git commit -m "$(cat <<'EOF'
feat(dashboard): ServiceBreakupTabComponent — sankey + service mix + routes

Three vertical sections:
- Service Flow (Sankey, Agent Type → Service → Flight) with client-side
  top-10 cap on flight stage, "Other flights" rollup for the remainder
  (OQ-P3-2)
- Service Mix Over Time (stacked vertical BarChartComponent, OQ-P3-4)
  with fixed SSR-code palette mapped from the prm-domain skill
- Top Routes (4-column PrimeNG p-table, OQ-P3-5)

Drill-down (OQ-P3-3): Sankey node click dispatches by name —
'Self'/'Outsourced' → setHandledBy, service codes → toggleService,
'Other flights' → no-op, default → toggleFlight. Link clicks no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tab nav + routing + module declaration

**Files:**
- Modify: `frontend/src/app/features/dashboard/dashboard.component.html` (add 3rd tab anchor)
- Modify: `frontend/src/app/features/dashboard/dashboard-routing.module.ts` (add child route)
- Modify: `frontend/src/app/features/dashboard/dashboard.module.ts` (declare ServiceBreakupTabComponent)

**Step 1 — `dashboard.component.html`:**

Add a third anchor with the same `routerLinkActive` and `queryParamsHandling` pattern:

```html
<nav class="dashboard-tabs" aria-label="Dashboard sections">
  <a routerLink="overview"        routerLinkActive="is-active" queryParamsHandling="preserve">Overview</a>
  <a routerLink="top10"           routerLinkActive="is-active" queryParamsHandling="preserve">Top 10</a>
  <a routerLink="service-breakup" routerLinkActive="is-active" queryParamsHandling="preserve">Service Breakup</a>
</nav>
```

**Step 2 — `dashboard-routing.module.ts`:**

Import + child route as in spec §11.

**Step 3 — `dashboard.module.ts`:**

Add `ServiceBreakupTabComponent` import + declarations entry.

**Step 4 — Verify + commit:**

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
docker compose run --rm frontend-dev npx ng build --configuration=production
git add frontend/src/app/features/dashboard/dashboard.component.html \
        frontend/src/app/features/dashboard/dashboard-routing.module.ts \
        frontend/src/app/features/dashboard/dashboard.module.ts
git commit -m "$(cat <<'EOF'
feat(routing): wire /dashboard/service-breakup as 3rd tab

Tab nav grows to 3 entries; queryParamsHandling: 'preserve' keeps
filter state across tab swaps. DashboardRoutingModule gets the new
child route; DashboardModule declares ServiceBreakupTabComponent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Browser smoke + tag

**Step 1 — Rebuild frontend container:**

```bash
docker compose up -d --build frontend
docker compose ps   # 5/5 healthy
```

**Step 2 — Browser smoke** at `http://aeroground.localhost:4200`:

Login as admin/admin123. Click PRM Dashboard tile → /dashboard/overview.

- [ ] Tab nav has 3 entries: OVERVIEW / TOP 10 / SERVICE BREAKUP. All mono-uppercase, primary-underline on active.
- [ ] Click SERVICE BREAKUP. URL changes to `/dashboard/service-breakup` keeping `?airport=...&date_from=...`.
- [ ] **Sankey renders** in the first section. Should see 2 agent-type nodes on the left (Self / Outsourced), ~5–9 service-code nodes in the middle, ≤10 flight nodes on the right + (potentially) an "Other flights" node if the tenant has more than 10 flights in the date range.
- [ ] Hover over any node — it highlights along with all its in/out links (echarts adjacency).
- [ ] Click the "Self" node → URL gains `?handled_by=SELF`. Click "Outsourced" → `?handled_by=OUTSOURCED` (replaces).
- [ ] Click "WCHR" (or any service node) → URL gains `?service=WCHR`; click again to clear.
- [ ] Click any flight node → URL gains `?flight=<code>`; other charts narrow.
- [ ] Click a Sankey *link* (the curved area between two nodes) — nothing should happen. No console error.
- [ ] **Stacked bar (Service Mix Over Time)** renders below the Sankey. X-axis: months from filter range. Each bar stacked with up to 9 SSR-coded segments. Legend at bottom shows code labels with color swatches. WCHR should be the dominant color (indigo, mapped from `--app-primary`).
- [ ] **Routes table** at bottom. 4 columns: Departure, Arrival, Count, % of total. Mono numerics right-aligned. Up to 10 rows.
- [ ] Empty state: pick a date range with no data → all 3 sections show empty state copy ("No data matches current filters" / empty table).
- [ ] Console: zero red errors.

**Step 3 — If anything fails, fix + recommit + redeploy.**

**Step 4 — Tag:**

```bash
git status                      # working tree clean
git tag -a v0.3.0-phase3 -m "Phase 3 (Service Breakup tab) complete

Third dashboard tab live on the angular-8-rewrite branch.
Sankey of Agent Type → Service → Flight (with client-side flight cap),
stacked vertical bar of service mix over time, top-routes table.

Drill-down on Sankey nodes wired (OQ-P3-3): handledBy/service/flight
filters all reachable by clicking nodes in the flow.

Includes 6 OQ resolutions:
- OQ-P3-1: 3-section tab (sankey + matrix + routes)
- OQ-P3-2: client-side top-10 flight cap with 'Other flights'
- OQ-P3-3: node-click drill-down (link clicks no-op)
- OQ-P3-4: stacked vertical BarChartComponent for monthly mix
- OQ-P3-5: 4-column routes table
- OQ-P3-6: vertical-stack layout

83/83 + ~9 new = ~92 frontend tests passing. Production AOT clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

No commit for this task.

---

## Common pitfalls (Phase 3 specific)

1. **echarts 4 sankey `as any` cast.** `EChartOption` typing in v4 doesn't include `'sankey'` in the series union. Cast at the array boundary, not inside arithmetic.
2. **Sankey first paint flash.** 32 layout iterations on first render = ~100ms of "loose" layout before settling. Acceptable; deferred to Phase 6 polish if user reports it.
3. **Empty `serviceCounts` rows.** A month with zero of a particular service has `serviceCounts[code]` undefined (not 0). Use `row.serviceCounts[code] || 0` when flattening to the stacked-series map.
4. **Sankey node-name clashes.** Drill-down dispatcher distinguishes by name comparison. If a tenant ever has a service code matching `'Self'` or a flight number that happens to look like an SSR code, dispatch is ambiguous. Documented as R-P3-1; not a Phase 3 blocker.
5. **`stackKeys` ordering.** `Object.keys(stackedSeries)` doesn't guarantee insertion order on every JS engine targeted by polyfills-es5. Always pass `stackKeys` explicitly from a derived array.
6. **`responsiveLayout="scroll"` on routes table.** Same gotcha as Phase 2's agents table — keeps columns aligned at the cost of horizontal scroll on narrow widths. Acceptable.

---

## Out of scope for this plan

| Phase | Deliverables |
|---|---|
| **Phase 4** (Fulfillment) | HeatmapChartComponent (7×24 grid: hours × days) + module + tab |
| **Phase 5** (Insights) | InsightsTabComponent — agent-service matrix |
| **Phase 6** (Polish) | Saved views, command palette, toasts, sparklines, palette generation from `--app-primary`, route-pair filter (`?from=DEL&to=BOM`) |
| **Phase 7** (Cutover) | Side-by-side vs `main`, merge decision |

After Phase 3 ships, request the Phase 4 plan with: *"Write the Phase 4 spec and plan."*
