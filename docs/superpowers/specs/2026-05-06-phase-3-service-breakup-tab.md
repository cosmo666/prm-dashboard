# Angular 8 + PrimeNG Rewrite — Phase 3 (Service Breakup Tab) Design Spec

**Date:** 2026-05-06
**Branch:** `angular-8-rewrite`
**Builds on:** [Phase 1 spec](./2026-05-05-phase-1-overview-tab.md), [Phase 2 spec](./2026-05-06-phase-2-top10-tab.md). Tooling, design system, FilterStore, BaseChartComponent, the `is-selected` row treatment, and the tab-nav shell are inherited.

---

## 1. Why Phase 3

Overview shows *what's happening right now*. Top 10 shows *who's driving the numbers*. Service Breakup answers *how PRM services flow and concentrate* — which agent type handles which service, where the services geographically cluster, and how the service mix shifts month-over-month.

The backend already exposes everything needed:
- `/breakdowns/by-agent-type` → 3-stage `SankeyResponse` (Agent Type → Service → Flight)
- `/breakdowns/by-service-type` → `ServiceTypeMatrixResponse` (month × service-type counts)
- `/breakdowns/by-route` → `RouteBreakdownResponse` (top departure→arrival pairs)

Three sections, one tab.

---

## 2. Scope

**In:**
- New `/dashboard/service-breakup` route mounting `ServiceBreakupTabComponent` inside the Phase 1 `DashboardComponent` shell.
- Tab nav gains a third entry: Overview / Top 10 / **Service Breakup**.
- New `SankeyChartComponent` wrapper (echarts 4 sankey, drill-down via node click).
- New stacked-vertical-bar capability via extending `BarChartComponent` (or a new `StackedBarChartComponent` — see §6).
- Routes section as a 4-column PrimeNG table (Departure, Arrival, Count, Percentage).

**Out (later phases):**
- Heatmap on Fulfillment (Phase 4) — distinct from the service-type matrix in this tab; that one is months × service types, the heatmap will be hours × days for time-of-day patterns.
- Agent-service matrix on Insights (Phase 5).
- Saved views, command palette (Phase 6).
- Per-route trend (would need a new backend endpoint).

---

## 3. Resolved OQs (decided 2026-05-06)

| OQ | Decision | Rationale |
|---|---|---|
| **OQ-P3-1** Tab scope | **3 sections** — Sankey + service-type-over-time stacked bar + routes table | One-chart tabs feel thin. All three backend endpoints already exist; deferring two of them creates artificial scarcity and pushes the tab back to Phase 4+ for no design reason. |
| **OQ-P3-2** Sankey flight-node explosion | **Client-side top-10 cap on flight stage, "Other flights" aggregation for the remainder** | Backend returns all distinct flights (potentially 50+ for a busy tenant). echarts 4 sankey becomes unreadable past ~30 nodes per stage. Stages 1 (agent type, ~2 nodes) and 2 (service, ~9 nodes) are naturally bounded. The cap lives in `ServiceBreakupTabComponent.mapToSankey()` — no backend change. |
| **OQ-P3-3** Drill-down from Sankey | **Yes — node click only.** agent-type node → `toggleHandledBy`; service node → `toggleService`; flight node → `toggleFlight`. Link clicks: no-op (links represent relationships, not filterable values). | Reuses the Phase 2 single-value/multi-value toggle pattern. Mirrors how the donut drill-down works on Overview. |
| **OQ-P3-4** Service-type-over-time chart | **Stacked vertical bar** — months on x-axis, stacked service mix per bar. Extend `BarChartComponent` with optional `[stackedSeries]` input mirroring `HorizontalBarChartComponent`'s Phase 2 extension. | Natural read for "service mix month-over-month". Heatmap is reserved for Phase 4 (hours × days). Stacked area would smooth over the discrete month-boundary nature of the data. |
| **OQ-P3-5** Routes display | **4-column PrimeNG table.** Departure, Arrival, Count, Percentage. Sortable columns, mono numerics, soft-primary `is-selected` row when a route is filtered (deferred — see §10). | Routes are inherently tabular. A donut would obscure geography; a Sankey of departure→arrival is redundant with the main agent-type Sankey. |
| **OQ-P3-6** Layout | **Vertical stack** — Sankey hero on top → service-type matrix bar → routes table at bottom | Same convention as Phase 2 (and Overview's chart row). Consistent reading order down the page. |

---

## 4. Backend reality

Three endpoints under `/api/prm/breakdowns/`. Already implemented in [`backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs`](../../../backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs); DTOs in [`BreakdownDtos.cs`](../../../backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs).

| Method | Endpoint | DTO | Phase 1 already used? |
|---|---|---|---|
| `serviceBreakupSankey()` | `GET /prm/breakdowns/by-agent-type` | `SankeyResponse { nodes: SankeyNode[]; links: SankeyLink[] }` | No — new in P3 |
| `serviceTypeMatrix()` | `GET /prm/breakdowns/by-service-type` | `ServiceTypeMatrixResponse { serviceTypes: string[]; rows: ServiceTypeMatrixRow[] }` | No — new in P3 |
| `topRoutes(limit=10)` | `GET /prm/breakdowns/by-route?limit=10` | `RouteBreakdownResponse { items: RouteItem[] }` | No — new in P3 |

DTOs (TS shape — copy to `prm-dtos.ts` verbatim):

```ts
// Source: backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs

export interface SankeyNode { name: string; value: number; }
export interface SankeyLink { source: string; target: string; value: number; }
export interface SankeyResponse {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface ServiceTypeMatrixRow {
  monthYear: string;                     // "2026-03" (yyyy-mm)
  serviceCounts: { [service: string]: number };
  total: number;
}
export interface ServiceTypeMatrixResponse {
  serviceTypes: string[];                // ordered SSR codes (WCHR, WCHC, MAAS, ...)
  rows: ServiceTypeMatrixRow[];          // ordered ascending by month
}

export interface RouteItem {
  departure: string;                     // IATA airport code
  arrival: string;
  count: number;
  percentage: number;
}
export interface RouteBreakdownResponse { items: RouteItem[]; }
```

The C# `prm_agent_type` column has a small enumeration (`Self` / `Outsourced` typically — verified by the seed data we saw in Phase 1's KPIs). The `prmCount` ratio scopes the Sankey to a manageable size on stage 1.

---

## 5. Frontend component architecture

```text
features/dashboard/
├── tabs/
│   └── service-breakup/                  # NEW directory
│       ├── service-breakup-tab.component.ts
│       ├── service-breakup-tab.component.html
│       ├── service-breakup-tab.component.scss
│       └── service-breakup-tab.component.spec.ts
├── services/
│   ├── prm-data.service.ts               # MODIFIED — add 3 methods
│   └── prm-dtos.ts                       # MODIFIED — add SankeyNode/Link/Response, ServiceTypeMatrix*, RouteItem/Response
├── dashboard-routing.module.ts           # MODIFIED — add child route `service-breakup`
└── dashboard.module.ts                   # MODIFIED — declare ServiceBreakupTabComponent

shared/
├── shared.module.ts                      # MODIFIED — declarations + exports for new chart wrappers
└── charts/
    ├── sankey-chart/                     # NEW
    │   ├── sankey-chart.component.ts
    │   ├── sankey-chart.component.html
    │   └── sankey-chart.component.spec.ts
    └── bar-chart/                        # MODIFIED (extend with optional stackedSeries)
        ├── bar-chart.component.ts        # — adds [stackedSeries], [stackKeys], [primaryLabel] inputs
        └── bar-chart.component.spec.ts   # — adds 2 stacked-mode tests

core/store/filter.store.ts                # NO CHANGES — toggleFlight/toggleService already exist;
                                          #   handledBy will use existing setHandledBy(['SELF']/['OUTSOURCED'])
```

Net new components: 2 (`ServiceBreakupTabComponent`, `SankeyChartComponent`). One existing wrapper extended (`BarChartComponent`).

---

## 6. `SankeyChartComponent` — new wrapper

```ts
import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

export interface SankeyChartNode { name: string; }
export interface SankeyChartLink { source: string; target: string; value: number; }

@Component({ selector: 'app-sankey-chart', templateUrl: './sankey-chart.component.html' })
export class SankeyChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() nodes: SankeyChartNode[] = [];
  @Input() links: SankeyChartLink[] = [];
  @Input() loading = false;
  @Input() height = 480;            // sankeys need vertical room

  /** Drill-down: clicking a NODE emits its name. Link clicks are intentionally no-op. */
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

  /** echarts emits dataType='node' for node clicks, 'edge' for links. We only act on nodes. */
  onChartClick(event: any): void {
    if (!event) { return; }
    if (event.dataType === 'node' && event.name) {
      this.nodeClick.emit(event.name);
    }
  }
}
```

Template:

```html
<app-base-chart [title]="title" [loading]="loading" [options]="options" [height]="height"
                (chartClick)="onChartClick($event)"></app-base-chart>
```

**echarts 4 sankey notes:**
- `nodeAlign: 'left'` aligns nodes to the left of each stage column. Other options: `'right'`, `'justify'`. Left reads naturally for "source → target" English.
- `lineStyle.color: 'gradient'` blends from source-node color to target-node color. echarts 4 gradients are flatter than v5 — this is a known visual delta, accepted per project memory.
- `emphasis.focus: 'adjacency'` highlights the clicked node + all its in/out links. UX-critical for a 30+ node chart.
- `as any` cast on the series array because `EChartOption` typings in echarts 4 don't include sankey — same pattern used by Phase 1/2 chart wrappers for similar series types.

---

## 7. `BarChartComponent` extension (vertical-stacked)

The Phase 0 `BarChartComponent` is a vertical-bar wrapper used in the Phase 0 `_smoke` page. Extend it with optional stacked-series support — same shape as Phase 2's `HorizontalBarChartComponent` extension, but flipped to vertical:

```ts
@Input() data: BarDatum[] = [];                // existing — primary stack base
@Input() stackedSeries?: { [serviceCode: string]: number[] };  // NEW — keys are series labels (e.g. service codes), values are per-bar counts in same order as `data`
@Input() stackKeys?: string[];                 // NEW — preserves order; defaults to Object.keys(stackedSeries)
@Input() primaryLabel = 'Total';               // unused when stacked; kept for symmetry
```

`ngOnChanges` builds:
- One y-axis category list from `data.map(d => d.label)` (the months)
- N stacked series (one per `stackKeys` entry)
- Each series uses a derived color: `resolvePrimary()` plus a hue rotation per stack index, OR a flat palette of slate-tinted hues
- Legend bottom (sankeys take the right side, so legend on stacked-bar goes to the bottom for visual balance)

**Color strategy:** The existing chart wrappers use single-color (primary) for everything. With 5–9 service types stacked per bar, single-hue won't distinguish them. Reuse the IATA SSR airline-region color palette from the `prm-domain` skill (the primary indigo for WCHR which is dominant, then derived hues for the others). `resolvePrimary()` stays the anchor for the dominant service type.

For Phase 3 we ship a fixed palette tied to the SSR codes:

```ts
// In service-breakup-tab.component.ts (NOT in the chart wrapper — keeps wrapper domain-agnostic)
const SSR_COLORS: { [code: string]: string } = {
  WCHR: 'var(--app-primary)',
  WCHC: '#1e3a8a',          // darker indigo
  WCHS: '#3b82f6',          // mid indigo
  MAAS: '#0ea5e9',          // sky
  UMNR: '#8b5cf6',          // violet
  DPNA: '#a855f7',          // purple
  BLND: '#10b981',          // emerald
  DEAF: '#22c55e',          // green
  MEDA: '#f59e0b',          // amber
};
```

Rendered as chart-readable strings (the var(...) gets resolved when echarts paints).

---

## 8. `ServiceBreakupTabComponent` — orchestrator

```ts
@Component({ selector: 'app-service-breakup-tab', templateUrl: './service-breakup-tab.component.html', styleUrls: ['./service-breakup-tab.component.scss'] })
export class ServiceBreakupTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(false);

  // Sankey state
  sankeyNodes$ = new BehaviorSubject<SankeyChartNode[]>([]);
  sankeyLinks$ = new BehaviorSubject<SankeyChartLink[]>([]);

  // Stacked bar state (months × service-type counts)
  monthlyMix$ = new BehaviorSubject<BarDatum[]>([]);                          // x-axis labels (months)
  monthlyMixStacked$ = new BehaviorSubject<{ [code: string]: number[] }>({});
  monthlyMixKeys$ = new BehaviorSubject<string[]>([]);                        // ordered service codes
  monthlyMixColors$ = new BehaviorSubject<{ [code: string]: string }>({});

  // Routes table state
  routes$ = new BehaviorSubject<RouteItem[]>([]);

  constructor(public filters: FilterStore, private data: PrmDataService) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) { return EMPTY; }
        this.loading$.next(true);
        return forkJoin({
          sankey:  this.data.serviceBreakupSankey(),
          matrix:  this.data.serviceTypeMatrix(),
          routes:  this.data.topRoutes(10),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // Sankey — capped client-side
        const sankey = this.capSankeyFlights(r.sankey, 10);
        this.sankeyNodes$.next(sankey.nodes.map(n => ({ name: n.name })));
        this.sankeyLinks$.next(sankey.links);

        // Matrix — flatten to BarDatum[] + stackedSeries
        const months = r.matrix.rows.map(row => row.monthYear);
        const types  = r.matrix.serviceTypes;
        const stacked: { [code: string]: number[] } = {};
        for (const t of types) {
          stacked[t] = r.matrix.rows.map(row => row.serviceCounts[t] || 0);
        }
        this.monthlyMix$.next(months.map(m => ({ label: m, value: 0 })));   // value irrelevant — bars come from stackedSeries
        this.monthlyMixStacked$.next(stacked);
        this.monthlyMixKeys$.next(types);
        this.monthlyMixColors$.next(this.colorMapForServices(types));

        // Routes — pass through
        this.routes$.next(r.routes.items || []);

        this.loading$.next(false);
      },
      err => { console.error('[service-breakup] forkJoin failed', err); this.loading$.next(false); },
    );
  }

  /** OQ-P3-2: client-side flight-stage cap. */
  private capSankeyFlights(raw: SankeyResponse, n: number): SankeyResponse {
    // Strategy: keep top-N flight nodes by total inbound link weight; aggregate rest into "Other flights".
    // (See plan T3 step 5 for full implementation — this method body is non-trivial; the plan covers it.)
    return raw;   // stub — replaced by plan T3 implementation
  }

  /** OQ-P3-3: node-click drill-down */
  onSankeyNodeClick(name: string): void {
    if (!name) { return; }
    if (name === 'Self' || name === 'Outsourced') {
      this.filters.setHandledBy([name.toUpperCase()]);
      return;
    }
    if (this.monthlyMixKeys$.value.indexOf(name) >= 0) {
      // It's a service code (WCHR, WCHC, etc.)
      this.filters.toggleService(name);
      return;
    }
    if (name === 'Other flights') { return; }
    // Otherwise treat as a flight number
    this.filters.toggleFlight(name);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private colorMapForServices(types: string[]): { [code: string]: string } {
    const SSR_COLORS: { [code: string]: string } = {
      WCHR: '#2563EB', WCHC: '#1e3a8a', WCHS: '#3b82f6',
      MAAS: '#0ea5e9', UMNR: '#8b5cf6', DPNA: '#a855f7',
      BLND: '#10b981', DEAF: '#22c55e', MEDA: '#f59e0b',
    };
    const out: { [code: string]: string } = {};
    for (const t of types) { out[t] = SSR_COLORS[t] || '#94a3b8'; }
    return out;
  }
}
```

The drill-down handler distinguishes nodes by inspecting their string. We could pass the stage/role from the Sankey data shape to be more disambiguated, but the simple approach is cleaner — `Self`/`Outsourced` are unique tokens; service codes come from the response's `monthlyMixKeys$` snapshot; flight numbers default-fall-through.

Edge: a tenant with a service code named "Self" or a flight named "WCHR" would mis-route. That's pathological — IATA SSR codes are 4 letters and uppercase by convention; "Self" is not a 4-letter code. Risk acknowledged in §13.

---

## 9. Template (`service-breakup-tab.component.html`)

```html
<div class="sb" *ngIf="(loading$ | async) !== null">
  <section class="sb-section">
    <header class="sb-section__head">
      <h2 class="sb-section__title">Service Flow</h2>
      <p class="sb-section__sub">Agent type → Service → Flight. Click any node to drill down. Top 10 flights shown; rest grouped as "Other flights".</p>
    </header>
    <app-sankey-chart
      [nodes]="sankeyNodes$ | async"
      [links]="sankeyLinks$ | async"
      [loading]="loading$ | async"
      (nodeClick)="onSankeyNodeClick($event)"></app-sankey-chart>
  </section>

  <section class="sb-section">
    <header class="sb-section__head">
      <h2 class="sb-section__title">Service Mix Over Time</h2>
      <p class="sb-section__sub">Stacked monthly counts by SSR code. WCHR (wheelchair-ramp) is the dominant primary hue; rarer services use derived tints.</p>
    </header>
    <app-bar-chart
      [data]="monthlyMix$ | async"
      [stackedSeries]="monthlyMixStacked$ | async"
      [stackKeys]="monthlyMixKeys$ | async"
      [stackColors]="monthlyMixColors$ | async"
      [loading]="loading$ | async"></app-bar-chart>
  </section>

  <section class="sb-section">
    <header class="sb-section__head">
      <h2 class="sb-section__title">Top Routes</h2>
      <p class="sb-section__sub">Departure → arrival pairs by PRM service count. {{ routes.length }} of top 10 routes shown.</p>
    </header>
    <p-table [value]="(routes$ | async) || []" [rows]="10" responsiveLayout="scroll" styleClass="routes-table">
      <ng-template pTemplate="header">
        <tr>
          <th class="mono">Departure</th>
          <th class="mono">Arrival</th>
          <th class="num">Count</th>
          <th class="num">% of total</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-route>
        <tr>
          <td class="mono">{{ route.departure }}</td>
          <td class="mono">{{ route.arrival }}</td>
          <td class="mono num">{{ route.count | number }}</td>
          <td class="mono num">{{ route.percentage | number:'1.1-1' }}%</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr><td colspan="4" class="empty">No routes match current filters</td></tr>
      </ng-template>
    </p-table>
  </section>
</div>
```

(Routes rows are not click-drillable in P3 — there's no `FilterStore.route` field. Adding a `from`/`to` filter pair is Phase 6 territory.)

---

## 10. `FilterStore` — no new mutators

The Sankey drill-down dispatches into existing mutators:
- agent-type node → `filters.setHandledBy([code])`
- service node → `filters.toggleService(code)` (Phase 1)
- flight node → `filters.toggleFlight(code)` (Phase 2)

No FilterStore changes needed. This is a pleasant outcome — we built the right primitives in P1/P2.

---

## 11. Routing

`dashboard-routing.module.ts`:

```ts
const routes: Routes = [{
  path: '',
  component: DashboardComponent,
  children: [
    { path: '',                pathMatch: 'full', redirectTo: 'overview' },
    { path: 'overview',        component: OverviewTabComponent,        data: { title: 'Overview' } },
    { path: 'top10',           component: Top10TabComponent,           data: { title: 'Top 10' } },
    { path: 'service-breakup', component: ServiceBreakupTabComponent,  data: { title: 'Service Breakup' } },
  ],
}];
```

`dashboard.component.html` tab nav gains a third anchor. Same `queryParamsHandling="preserve"` pattern as P2.

---

## 12. Layout

```text
┌─────────────────────────────────────────────────────────┐
│  [filter bar]                                           │
├─────────────────────────────────────────────────────────┤
│  OVERVIEW   |   TOP 10   |   SERVICE BREAKUP            │  ← tab nav (3 entries)
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Service Flow (Sankey, 480px tall)                      │
│  ── Agent Type → Service → Flight                       │
│  ── click any node to drill                             │
│                                                         │
│  Service Mix Over Time (stacked vertical bar, 320px)    │
│  ── x: months, y: count, stacked by service code        │
│                                                         │
│  Top Routes (4-col table, ~auto)                        │
│  ── Departure / Arrival / Count / % of total            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 13. Risks / latent concerns

- **R-P3-1 — Sankey label collision in drill-down.** Node names are passed through `nodeClick` as plain strings. If a tenant ever has a service code that matches `'Self'`/`'Outsourced'` (or a flight number that happens to match an SSR code), the dispatcher mis-routes. Risk is theoretical — IATA SSR codes are uppercase 3-4 letter strings; flight numbers are alphanumeric with a digit suffix. Mitigation if it ever surfaces: extend the dispatcher to inspect `event.dataType` and the `event.data.role` (we'd need to tag nodes by stage at SankeyChartComponent build time).
- **R-P3-2 — echarts 4 sankey gradient flatness.** v4 sankey gradients are visibly flatter than v5; the project memory `frontend_version_pins` already accepts this. The Phase 0 ticked off this trade-off; surfacing again so reviewers know it's intentional.
- **R-P3-3 — Stacked bar legend overflow.** With 9 SSR codes the legend can wrap awkwardly on narrow widths. Accept; revisit if user reports clipping.
- **R-P3-4 — Sankey first paint flash.** echarts sankey computes layout via 32 iterations on first paint; for ~50-node sankey this can flash a "loose" layout for ~100ms before settling. echarts 4 doesn't expose a static-snapshot API. Acceptable; users on slow machines may see one frame of loose nodes.
- **R-P3-5 — Color palette doesn't react to tenant `--app-primary`.** Only the WCHR hue is `--app-primary`; the rest are fixed hex. A tenant with a brand color far from indigo (e.g. green airline) gets a one-color match (WCHR) and 8 indigo-adjacent hues. Acceptable POC compromise; full palette generation from `--app-primary` is Phase 6 polish.

---

## 14. Definition of done

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit -p tsconfig.app.json` clean
- [ ] `npm test` ≥ 90 passing (Phase 2 ended at 83 + ~7 new Phase 3 tests)
- [ ] `npx ng build --configuration=production` clean
- [ ] Browser smoke at `http://aeroground.localhost:4200/dashboard/service-breakup`:
  - [ ] Tab nav has 3 entries; clicking each preserves `?airport=...&date_from=...`
  - [ ] Sankey renders 3 stages on default MTD anchor (Mar 2026): 2 agent-type nodes, ~5–9 service nodes, ≤10 flight nodes + "Other flights" if more exist
  - [ ] Click a service node → URL gains `?service=<code>`; KPIs/charts on Overview narrow accordingly when navigating back
  - [ ] Click an agent-type node ("Self" / "Outsourced") → URL gains `?handled_by=<value>`
  - [ ] Click a flight node → URL gains `?flight=<n>`
  - [ ] Click a Sankey link (not node) → no URL change, no console error
  - [ ] Service-mix stacked bar shows months on x-axis, stacked service mix per month, legend at bottom with SSR-code labels and color swatches
  - [ ] Routes table renders Top 10 routes; mono columns right-aligned; percentages show one decimal + `%`
  - [ ] Empty state on a no-data date range: Sankey shows "No data matches current filters", stacked bar shows empty state, routes table shows "No routes match"
- [ ] Tag `v0.3.0-phase3` after smoke passes
