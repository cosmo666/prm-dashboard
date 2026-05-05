# Phase 1 — Overview Tab (Vertical Slice)

| | |
|---|---|
| **Date** | 2026-05-05 |
| **Author** | Prerak Gupta |
| **Status** | Draft — pending user approval |
| **Branch** | `angular-8-rewrite` |
| **Builds on** | [Phase 0 spec](./2026-05-05-angular-8-primeng-rewrite-design.md) (Foundation), [Phase 0 plan](../plans/2026-05-05-angular-8-rewrite-phase-0.md) |
| **Backend impact** | None — backend, auth, tenancy, data layer unchanged |
| **Estimated effort** | 14–18 hours (one focused work-day; plan has 13 tasks) |

---

## 1. Executive summary

Phase 0 delivered a runnable Angular 8 + PrimeNG shell — login, home tile picker, theme toggle, BaseChartComponent + BarChartComponent proof, dev container, Docker production image. The dashboard, however, is still a stub ("not yet ported").

**Phase 1 ports the first dashboard tab — Overview — end-to-end.** This is the vertical-slice phase: the foundation gets stress-tested by something real (URL-synced filter state, RBAC-scoped airport selector, three new chart wrappers, KPI cards with deltas, a 16-preset date-range picker, a `forkJoin` over five backend endpoints). Tabs 2–5 (Top 10, Service Breakup, Fulfillment, Insights) are deliberately deferred to Phases 2–5 — once Overview is right, the remaining tabs are mechanical.

The Phase 0 acceptance pass uncovered five integration bugs from inventing frontend DTO shapes that didn't match the backend (see [`phase0_dto_alignment_lessons.md`](../../../.claude/memory/phase0_dto_alignment_lessons.md)). Phase 1 has more DTO surface area than Phase 0 had — five endpoints, eleven DTOs. The plan starts with a Task 0 that mandates reading `backend/src/PrmDashboard.Shared/DTOs/*.cs` **before** writing the frontend interfaces. Acceptance is browser-based smoke, not curl.

The .NET 8 backend, the DuckDB-over-Parquet data layer, the JWT auth contract, the subdomain-based multi-tenancy, the airport RBAC middleware are **all untouched**. Frontend-only.

---

## 2. Goals

- Render the Overview dashboard end-to-end against a real backend, on a real seeded tenant (`aeroground`), in a real browser
- Hydrate filter state from URL query params on entry; write changes back so reload + URL sharing both work
- Multi-select airport (RBAC-scoped via `AuthStore.airportCodes$`), airline, service-type, handled-by, with a 16-preset date-range picker
- 4 KPI cards with delta vs previous period and the design's mono-numeric value treatment (preserves the Phase 0 `_kpi-cards.scss` work)
- 3 charts: Daily PRM Trend (line), Service Type Breakdown (donut), Top Airlines (horizontal bar) — each as a new wrapper around `BaseChartComponent`
- All five HTTP calls run as a single `forkJoin` per filter change; loading state propagates correctly to all KPIs and charts
- Continue the Phase 0 testing discipline — each new component gets at least a sanity spec; total frontend test count goes from 21 → ~30
- Maintain `ng build --configuration production` clean and `npm run lint` passing

## 3. Non-goals

- Tabs 2–5 (Top 10, Service Breakup, Fulfillment, Insights) — Phases 2–5
- Saved views, command palette, toast container — Phase 6
- The `Insights` tab fully — Phase 5
- Period-over-period overlays on the line chart — only the simple "vs prev period" KPI delta is in scope; the full PoP line chart can land in Phase 6 polish if there's time
- Drill-downs from chart click → filter mutation (the Angular 17 source has them; defer to Phase 6 polish — too easy to subtly miswire and Phase 1 already has plenty)
- Sparklines inside KPI cards (the Angular 17 source has 5 sparklines per card; mostly demo polish — defer)
- Annotations on the line chart (`DEMO_ANNOTATIONS`) — Phase 6
- E2E test framework (none today, none added)
- New backend endpoints, DTO shape changes, or controller route changes — Phase 1 consumes only what's already on `main` for backend

---

## 4. Decisions log

Phase 1 introduces a small handful of new architectural decisions on top of Phase 0. Foundational decisions (NgModules, BehaviorSubject stores, PrimeNG 8 `.ui-*` overrides, dev container, "Operations Console" design system, per-tenant primary) carry forward unchanged from Phase 0; see [Phase 0 spec §4](./2026-05-05-angular-8-primeng-rewrite-design.md#4-decisions-log).

| # | Question | Answer | Rationale |
|---|---|---|---|
| P1-Q1 | How do we sync filters to the URL without `effect()`? | Manual `Router.navigate` subscription in `DashboardComponent.ngOnInit`, debounced 150 ms, gated by a `skip(1)` so initial hydration doesn't trigger a write | Same end-user behaviour as the Angular 17 effect; pure RxJS, no signal-store machinery |
| P1-Q2 | Where does the date-range default get computed? | `FilterStore.applyDefault()` runs on first construction if no URL params present; default preset is `mtd` | Mirrors Angular 17 behaviour; users land on a meaningful range |
| P1-Q3 | Do KPIs and charts each own their own loading state? | No — single `loading$` BehaviorSubject in `OverviewTabComponent`, set true on filter change, set false when `forkJoin` completes | Matches Angular 17 behaviour; consistent skeleton timing |
| P1-Q4 | Where do we compute "vs previous period" deltas? | Frontend, against `KpiSummaryResponse.totalPrmPrevPeriod` / `avgDurationPrevPeriod` returned by the backend | Backend already does the heavy lifting (`GetPrevPeriodStart`); frontend just computes percent change. **Don't** invent a second prev-period calculation |
| P1-Q5 | Do we use PrimeNG `p-multiSelect` for the airport filter? | Yes — same as airline / service / handled-by | Consistent multi-select UX; the airport filter's RBAC scoping is enforced at option-list construction time, not at component-type level |
| P1-Q6 | How do we render the 16-preset date range? | Custom panel: scrollable preset list on the left, `p-calendar` (range mode) on the right, in a single PrimeNG popover anchored to the trigger button | Angular 17 used a custom `mat-menu`; we replace the menu chrome with a PrimeNG `p-overlayPanel`. `date-presets.ts` (the `resolvePreset()` function) ports verbatim — it's framework-agnostic |
| P1-Q7 | What's the route hierarchy under `/dashboard`? | `/dashboard` lazy-loads `DashboardModule` → child route `/dashboard/overview` is the default; further tabs slot in as siblings (`/dashboard/top10`, etc.) | Reload preserves which tab the user was on; URL-shareable; matches Angular 17 |
| P1-Q8 | Where does `PrmDataService` live? | `frontend/src/app/features/dashboard/services/prm-data.service.ts` — same path as Angular 17 — but **not** `providedIn: 'root'`. Provided by `DashboardModule` | Lazy injector boundary; not used outside the dashboard. Lazy-load isolation matches the Angular 17 structure |
| P1-Q9 | How are date-range query-param keys formatted? | `date_from`, `date_to` (snake_case, matches the backend `PrmFilterParams.DateFrom` / `DateTo` binding from `[FromQuery]`) | Don't invent new param names; the backend already accepts these |
| P1-Q10 | How do we wire the chart click events? | `(barClick)` / `(segmentClick)` / `(pointClick)` outputs on each chart wrapper, **but Phase 1 only wires the no-op handler** that logs to `console.debug`. Drill-down logic lands in Phase 6 | The Angular 17 source mutates `FilterStore` from chart clicks — easy to subtly break. Wire the events but don't act on them yet |

---

## 5. New types and shapes

**Standing rule (every interface in this section).** Before adding any new type to `prm-dtos.ts`, open the corresponding C# record in `backend/src/PrmDashboard.Shared/DTOs/*.cs` and copy its field names verbatim, lowercasing the first letter. Phase 0 caught five DTO drift bugs; the cost of revisiting is far higher than the cost of one extra file read. See [`phase0_dto_alignment_lessons.md`](../../../.claude/memory/phase0_dto_alignment_lessons.md).

The Overview tab consumes five endpoints. Their DTOs and source records:

| Frontend type | Backend record | File |
|---|---|---|
| `KpiSummaryResponse` | `KpiSummaryResponse` | `backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs` |
| `DailyTrendResponse` | `DailyTrendResponse` | `backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs` |
| `RankingItem`, `RankingsResponse` | `RankingItem`, `RankingsResponse` | `backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs` |
| `BreakdownItem`, `BreakdownResponse` | `BreakdownItem`, `BreakdownResponse` | `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs` |
| `FilterOptionsResponse` | `FilterOptionsResponse` | (lives in `BreakdownDtos.cs`) |

The exact frontend interfaces — copy these verbatim into `prm-dtos.ts`:

```ts
// ---------- KPIs ----------
export interface KpiSummaryResponse {
  totalPrm: number;
  totalPrmPrevPeriod: number;
  totalAgents: number;
  agentsSelf: number;
  agentsOutsourced: number;
  avgServicesPerAgentPerDay: number;
  avgServicesPrevPeriod: number;
  avgDurationMinutes: number;
  avgDurationPrevPeriod: number;
  fulfillmentPct: number;
}

// ---------- Trends ----------
export interface DailyTrendResponse {
  dates: string[];   // yyyy-mm-dd
  values: number[];  // service count per day
  average: number;
}

// ---------- Rankings ----------
export interface RankingItem {
  label: string;
  count: number;
  percentage: number;
}
export interface RankingsResponse {
  items: RankingItem[];
}

// ---------- Breakdowns ----------
export interface BreakdownItem {
  label: string;
  count: number;
  percentage: number;
}
export interface BreakdownResponse {
  items: BreakdownItem[];
}

// ---------- Filter options ----------
export interface FilterOptionsResponse {
  airlines: string[];
  services: string[];
  handledBy: string[];
  flights: string[];
  minDate: string | null;  // yyyy-mm-dd
  maxDate: string | null;
}
```

(Phase 2+ tabs will add the rest — `HourlyHeatmapResponse`, `SankeyResponse`, `AgentRankingsResponse`, etc. Don't create them now; they're not consumed yet, and unused types attract drift.)

### Filter state shape

```ts
export type DatePreset =
  | 'today' | 'yesterday' | 'last7' | 'last30'
  | 'mtd' | 'last_month' | 'last_3_months' | 'last_6_months'
  | 'qtd' | 'ytd' | 'calendar_year' | 'last_year'
  | 'q1' | 'q2' | 'q3' | 'q4'
  | 'custom';

export interface FilterState {
  airport: string[];     // multi-select, RBAC-scoped
  datePreset: DatePreset;
  dateFrom: string;      // yyyy-mm-dd
  dateTo: string;        // yyyy-mm-dd
  airline: string[];
  service: string[];
  handledBy: string[];   // ['SELF'] | ['OUTSOURCED'] | ['SELF','OUTSOURCED'] | []
  flight: string;        // single-value
  agentNo: string;       // single-value
}
```

Identical to the Angular 17 `FilterState` on `main` so saved-view JSON snapshots remain round-tripable when Phase 6 ships saved views.

### Wire conventions for query params (don't invent new names)

| FilterState field | URL param | Backend `PrmFilterParams` property | Format |
|---|---|---|---|
| `airport` | `airport` | `Airport` (parsed into `AirportList`) | CSV: `DEL,BOM` |
| `dateFrom` | `date_from` | `DateFrom` | `yyyy-mm-dd` |
| `dateTo` | `date_to` | `DateTo` | `yyyy-mm-dd` |
| `airline` | `airline` | `Airline` (parsed into `AirlineList`) | CSV |
| `service` | `service` | `Service` (parsed into `ServiceList`) | CSV |
| `handledBy` | `handled_by` | `HandledBy` (parsed into `HandledByList`) | CSV |
| `flight` | `flight` | `Flight` | string |
| `agentNo` | `agent_no` | `AgentNo` | string |
| `datePreset` | *(not on wire)* | *(not on wire)* | — |

`datePreset` lives in `FilterStore` only — it's UI sugar; the backend gets resolved `dateFrom` / `dateTo`.

---

## 6. Project structure additions

Phase 0 left the dashboard tree empty — Phase 1 fills it in. Greyed-out lines exist already from Phase 0; new lines are marked `+`.

```text
frontend/src/app/
├── core/
│   ├── store/
│   │   ├── auth.store.ts                  # (Phase 0)
│   │   ├── tenant.store.ts                # (Phase 0)
+   │   ├── filter.store.ts                # NEW — BehaviorSubject filter state (URL-sync via DashboardComponent)
+   │   └── navigation.store.ts            # NEW — active tab name for breadcrumb / page title
│   └── theme/theme.service.ts             # (Phase 0)
│
├── features/
+   └── dashboard/
+       ├── dashboard.module.ts
+       ├── dashboard-routing.module.ts
+       ├── dashboard.component.{ts,html,scss}      # Shell — filter bar + <router-outlet> for tabs
+       ├── components/
+       │   ├── filter-bar/                          # Composite of multi-selects + date range
+       │   │   └── filter-bar.component.{ts,html,scss}
+       │   ├── airport-selector/                    # RBAC-scoped p-multiSelect
+       │   │   └── airport-selector.component.{ts,html,scss}
+       │   ├── date-range-picker/                   # Two-panel: presets + p-calendar
+       │   │   └── date-range-picker.component.{ts,html,scss}
+       │   └── kpi-card/
+       │       └── kpi-card.component.{ts,html,scss}
+       ├── services/
+       │   ├── prm-data.service.ts                  # Wraps the 5 Overview endpoints
+       │   └── prm-dtos.ts                          # Mirrors backend DTOs
+       ├── utils/
+       │   ├── date-presets.ts                      # 16 presets — port verbatim
+       │   └── poc-today.ts                         # POC_TODAY anchored to env.pocToday
+       └── tabs/
+           └── overview/
+               └── overview-tab.component.{ts,html,scss,spec.ts}
│
└── shared/
    ├── shared.module.ts                            # (Phase 0) — add new chart wrappers
    └── charts/
        ├── base-chart/                             # (Phase 0)
        ├── bar-chart/                              # (Phase 0)
+       ├── line-chart/                             # NEW — daily trend
+       │   └── line-chart.component.{ts,html,spec.ts}
+       ├── donut-chart/                            # NEW — service-type breakdown
+       │   └── donut-chart.component.{ts,html,spec.ts}
+       └── horizontal-bar-chart/                   # NEW — top airlines
+           └── horizontal-bar-chart.component.{ts,html,spec.ts}
```

Out of scope for Phase 1 (note for the plan author): `tabs/top10/`, `tabs/service-breakup/`, `tabs/fulfillment/`, `tabs/insights/`, `charts/sankey-chart/`, `charts/heatmap-chart/`, `core/store/saved-views.store.ts`, `shared/components/saved-views-menu/`, `shared/components/command-palette/`, `shared/pipes/compact-number.pipe.ts` (we use Angular's built-in `DecimalPipe` + a tiny inline helper for "k / M" formatting; full pipe lands when more than one tab needs it).

---

## 7. FilterStore — design

```ts
@Injectable({ providedIn: 'root' })
export class FilterStore {
  private _airport$    = new BehaviorSubject<string[]>([]);
  private _datePreset$ = new BehaviorSubject<DatePreset>('mtd');
  private _dateFrom$   = new BehaviorSubject<string>('');
  private _dateTo$     = new BehaviorSubject<string>('');
  private _airline$    = new BehaviorSubject<string[]>([]);
  private _service$    = new BehaviorSubject<string[]>([]);
  private _handledBy$  = new BehaviorSubject<string[]>([]);
  private _flight$     = new BehaviorSubject<string>('');
  private _agentNo$    = new BehaviorSubject<string>('');

  // Public observable API
  airport$    = this._airport$.asObservable();
  datePreset$ = this._datePreset$.asObservable();
  dateFrom$   = this._dateFrom$.asObservable();
  dateTo$     = this._dateTo$.asObservable();
  airline$    = this._airline$.asObservable();
  service$    = this._service$.asObservable();
  handledBy$  = this._handledBy$.asObservable();
  flight$     = this._flight$.asObservable();
  agentNo$    = this._agentNo$.asObservable();

  // Synchronous snapshots (for services and guards)
  get airportSnapshot(): string[]    { return this._airport$.value; }
  get datePresetSnapshot(): DatePreset { return this._datePreset$.value; }
  get dateFromSnapshot(): string     { return this._dateFrom$.value; }
  get dateToSnapshot(): string       { return this._dateTo$.value; }
  get airlineSnapshot(): string[]    { return this._airline$.value; }
  get serviceSnapshot(): string[]    { return this._service$.value; }
  get handledBySnapshot(): string[]  { return this._handledBy$.value; }
  get flightSnapshot(): string       { return this._flight$.value; }
  get agentNoSnapshot(): string      { return this._agentNo$.value; }

  // Derived: full URL query-params dict — debounced consumer subscribes
  queryParams$: Observable<Record<string, string>> = combineLatest([
    this._airport$, this._dateFrom$, this._dateTo$,
    this._airline$, this._service$, this._handledBy$,
    this._flight$, this._agentNo$,
  ]).pipe(
    map(([airport, dateFrom, dateTo, airline, service, handledBy, flight, agentNo]) => {
      const params: Record<string, string> = {};
      if (airport.length > 0)   { params['airport']    = airport.join(','); }
      if (dateFrom)             { params['date_from']  = dateFrom; }
      if (dateTo)               { params['date_to']    = dateTo; }
      if (airline.length > 0)   { params['airline']    = airline.join(','); }
      if (service.length > 0)   { params['service']    = service.join(','); }
      if (handledBy.length > 0) { params['handled_by'] = handledBy.join(','); }
      if (flight)               { params['flight']     = flight; }
      if (agentNo)              { params['agent_no']   = agentNo; }
      return params;
    }),
    shareReplay(1)
  );

  // Mutations
  setAirport(value: string | string[] | null): void { this._airport$.next(this.normalize(value)); }
  toggleAirport(code: string): void { /* ... never empty rule ... */ }
  removeAirport(value: string): void { this._airport$.next(this._airport$.value.filter(v => v !== value)); }
  setDateRange(preset: DatePreset, from: string, to: string): void { /* ... */ }
  setAirline(v: string | string[] | null): void { /* ... */ }
  setService(v: string | string[] | null): void { /* ... */ }
  setHandledBy(v: string | string[] | null): void { /* ... */ }
  removeAirline(v: string): void { /* ... */ }
  removeService(v: string): void { /* ... */ }
  removeHandledBy(v: string): void { /* ... */ }
  clearSecondary(): void { /* clear airline/service/handledBy/flight/agentNo */ }
  hydrateFromQueryParams(params: Record<string, string>): void { /* parse CSVs */ }
  applyDefault(): void { /* mtd → resolvePreset('mtd', POC_TODAY) → setDateRange */ }

  private normalize(v: string | string[] | null | undefined): string[] {
    if (!v) { return []; }
    if (Array.isArray(v)) { return v.filter(s => s && s.length > 0); }
    return v.length > 0 ? [v] : [];
  }
}
```

### URL sync — the one tricky bit

`DashboardComponent.ngOnInit` orchestrates the round trip. **No `effect()`.** Manual subscriptions, debounced, with explicit cleanup.

```ts
ngOnInit(): void {
  // 1) Hydrate from URL on first paint
  this.route.queryParams.pipe(
    take(1),
    takeUntil(this.destroy$)
  ).subscribe(params => {
    if (Object.keys(params).length === 0) {
      this.filters.applyDefault();             // default to mtd
    } else {
      this.filters.hydrateFromQueryParams(params);
    }
  });

  // 2) Push subsequent changes back to URL
  this.filters.queryParams$.pipe(
    skip(1),                                    // ignore the snapshot emitted by hydration
    debounceTime(150),
    takeUntil(this.destroy$)
  ).subscribe(qp => {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      queryParamsHandling: '',                  // replace, not merge — empty filters must clear params
    });
  });
}
```

Two pitfalls to avoid:

- **`queryParamsHandling: 'merge'` keeps stale params.** When the user clears `airline`, the param must disappear from the URL. Empty string is the right value.
- **The `skip(1)` is load-bearing.** `combineLatest` emits synchronously on subscription with the current snapshot of every source; without `skip(1)` the first emission would fire a `router.navigate` immediately on mount and overwrite the URL params we just hydrated from.

### `applyDefault()` — what does the user land on?

Anchored to `POC_TODAY` (from `environment.pocToday`, which is `'2026-03-31'` in dev so seed data is in range; `''` in production → falls back to real `new Date()`). Default preset is `mtd` — Month To Date — so the dashboard always shows recent data. Same as Angular 17.

Default airport is the **first** code from `AuthStore.airportCodesSnapshot`. Backend filter endpoint requires at least one airport (returns 400 otherwise — see `FiltersController.GetOptions`); this is also the "never-empty airport array" invariant.

---

## 8. Component architecture

### Render graph

```
DashboardComponent (route /dashboard, lazy)
├── <app-filter-bar>                          # in dashboard.component.html
│   ├── <app-airport-selector>                # multi-select, RBAC-filtered
│   ├── <app-form-field label="Airline"><p-multiSelect/></app-form-field>
│   ├── <app-form-field label="Service"><p-multiSelect/></app-form-field>
│   ├── <app-form-field label="Handled By"><p-multiSelect/></app-form-field>
│   └── <app-date-range-picker>
└── <router-outlet>                           # child route: /dashboard/overview
    └── OverviewTabComponent
        ├── <app-kpi-card> × 4
        ├── <app-line-chart>                  # Daily PRM Trend
        ├── <app-donut-chart>                 # Service Type Breakdown
        └── <app-horizontal-bar-chart>        # Top Airlines
```

### `DashboardComponent`

- Owns the FilterStore ↔ URL sync (Section 7)
- Renders `<app-filter-bar>` once at the top, then `<router-outlet>` for tab content
- `ngOnDestroy` calls `destroy$.next()` so the URL-sync subscriptions terminate when the user navigates away
- Holds no chart logic — that's the tab component's job

### `FilterBarComponent`

- On init, fetches `/prm/filters/options` for the current airport set and stores `airlines: string[]` / `services: string[]` in local `BehaviorSubject`s (so it can re-fetch when the airport set changes)
- Each multi-select reads `filters.<field>$ | async` and writes back via `filters.set<Field>(value)`. The `(onChange)` event from `p-multiSelect` returns `{ value: string[] }`.
- Re-fetches options when `airport$` emits a new airport list — debounced 150 ms to avoid thrashing while the user toggles airports.
- Renders selected values as chips below the row (so the row stays compact). Click an `×` icon on a chip → calls `filters.remove<Field>(code)`.

### `AirportSelectorComponent`

- Subscribes to `AuthStore.airports$` (full `AirportInfo[]` from the JWT — `{ code, name }`)
- Builds the option list as `airports.map(a => ({ label: a.name + ' (' + a.code + ')', value: a.code }))`
- Two-way bound to `filters.airport$` / `filters.setAirport()`
- **Never-empty invariant:** if the user attempts to deselect the last airport, the component intercepts and ignores the action. Implemented in `onChange`:

  ```ts
  onChange(event: { value: string[] }): void {
    if (event.value.length === 0) {
      // Re-emit the prior selection — never-empty rule
      this.value = this.filters.airportSnapshot;
      return;
    }
    this.filters.setAirport(event.value);
  }
  ```

### `DateRangePickerComponent`

- Trigger button shows the current preset label + the resolved date range, mono-formatted via Fira Code
- Click trigger → opens a `p-overlayPanel` with two stacked regions:
  - **Left/top:** scrollable preset list. Clicking a preset calls `resolvePreset(preset, POC_TODAY)` → `filters.setDateRange(preset, from, to)` and closes the panel
  - **Right/bottom:** a `p-calendar [selectionMode]="'range'"`. Selecting a range emits `[Date, Date]`; the component converts to ISO `yyyy-mm-dd` and calls `filters.setDateRange('custom', from, to)`
- Custom-range and preset selections are mutually exclusive — picking a preset clears the calendar's `[(ngModel)]`; picking a calendar range sets `datePreset` to `'custom'`
- `date-presets.ts` ports verbatim from Angular 17 (it's framework-agnostic — just date math)

### `KpiCardComponent`

- All visual styling lives in `_kpi-cards.scss` (Phase 0). The component is a thin wrapper that toggles classes.
- Inputs:
  - `label: string` — UPPERCASE Fira Code label
  - `value: string` — already-formatted value (caller decides "12.5k" vs "12,500" vs "98.4%")
  - `delta: number | null` — percent change vs prev period; `null` hides the delta block
  - `subtext: string | null` — optional second line ("Self · 12   Outsourced · 4")
  - `loading: boolean` — toggles `kpi-card--loading` class for skeleton
- No sparkline in Phase 1 (Angular 17 has them; defer to Phase 6)
- No accent prop — the design uses a single primary stripe; tenants vary the primary via `--app-primary`. Don't reintroduce per-card `accent` colors (the rainbow KPI move was rejected — see `design_direction.md`)

### `OverviewTabComponent`

The orchestrator. Subscribes to `filters.queryParams$`, on every emission:

1. Set `loading$` to `true`
2. `forkJoin` the five endpoints
3. Subscribe `next:` (typed result), populate the 4 KPIs and 3 chart inputs, set `loading$` to `false`
4. Subscribe `error:`, log to `console.error`, set `loading$` to `false`, leave existing data in place

```ts
private destroy$ = new Subject<void>();
loading$ = new BehaviorSubject<boolean>(false);

// KPI state
totalPrm$    = new BehaviorSubject<number>(0);
totalDelta$  = new BehaviorSubject<number | null>(null);
avgDuration$ = new BehaviorSubject<number>(0);
durationDelta$ = new BehaviorSubject<number | null>(null);
fulfillmentPct$ = new BehaviorSubject<number>(0);
totalAgents$ = new BehaviorSubject<number>(0);
agentsSelf$ = new BehaviorSubject<number>(0);
agentsOutsourced$ = new BehaviorSubject<number>(0);

// Chart state
dailyTrend$ = new BehaviorSubject<DailyTrendResponse | null>(null);
serviceTypes$ = new BehaviorSubject<DonutDatum[]>([]);
topAirlines$ = new BehaviorSubject<BarDatum[]>([]);

ngOnInit(): void {
  this.filters.queryParams$.pipe(
    debounceTime(50),
    switchMap(() => {
      // Empty airport guard — backend requires at least one
      if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
        return EMPTY;
      }
      this.loading$.next(true);
      return forkJoin({
        kpis:      this.data.kpisSummary(),
        trend:     this.data.trendsDaily('count'),
        services:  this.data.topServices(),
        airlines:  this.data.topAirlines(10),
        // filterOptions is fetched inside FilterBarComponent — separate concern
      });
    }),
    takeUntil(this.destroy$)
  ).subscribe({
    next: r => {
      this.totalPrm$.next(r.kpis.totalPrm);
      const prevPrm = r.kpis.totalPrmPrevPeriod;
      this.totalDelta$.next(prevPrm ? ((r.kpis.totalPrm - prevPrm) / prevPrm) * 100 : null);
      this.avgDuration$.next(r.kpis.avgDurationMinutes);
      const prevDur = r.kpis.avgDurationPrevPeriod;
      this.durationDelta$.next(prevDur ? ((r.kpis.avgDurationMinutes - prevDur) / prevDur) * 100 : null);
      this.fulfillmentPct$.next(r.kpis.fulfillmentPct);
      this.totalAgents$.next(r.kpis.totalAgents);
      this.agentsSelf$.next(r.kpis.agentsSelf);
      this.agentsOutsourced$.next(r.kpis.agentsOutsourced);

      this.dailyTrend$.next(r.trend);

      // RankingsResponse → DonutDatum[]
      this.serviceTypes$.next((r.services.items || []).slice(0, 5).map(s => ({
        name: s.label, value: s.count,
      })));
      // RankingsResponse → BarDatum[]
      this.topAirlines$.next((r.airlines.items || []).map(a => ({
        label: a.label, value: a.count,
      })));

      this.loading$.next(false);
    },
    error: err => {
      console.error('[overview] forkJoin failed', err);
      this.loading$.next(false);
    },
  });
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

### KPIs the user sees (4 cards)

| Card | Value | Delta | Subtext |
|---|---|---|---|
| **Total PRM Services** | `totalPrm` (compact-formatted: `15.2k`, `1.5M`) | `((totalPrm - prev) / prev) * 100` | "vs prev period" |
| **Active Agents** | `totalAgents` | (none) | `Self · ${agentsSelf}   Outsourced · ${agentsOutsourced}` |
| **Avg Duration (min)** | `avgDurationMinutes` (rounded to int) | `((avg - prev) / prev) * 100` | "vs prev period" |
| **Fulfillment Rate** | `fulfillmentPct` (1 decimal, with `%`) | (none) | (none) |

(The Angular 17 source has 5 KPI cards — "Avg Services / Agent / Day" is the fifth. We can ship 4 in Phase 1 and add the fifth in Phase 6 polish if there's room. Spec calls for 4; backend already returns the data, so adding the fifth later is a one-line change.)

---

## 9. Chart wrappers (additions to `shared/charts/`)

Each new wrapper follows the Phase 0 BarChart pattern: typed `@Input` data, build `EChartOption` in `ngOnChanges`, pass to `<app-base-chart>`.

### `LineChartComponent`

- `@Input() title: string`
- `@Input() subtitle: string`
- `@Input() trend: DailyTrendResponse | null` — direct DTO consumption, no intermediate shape
- `@Input() loading: boolean = false`
- `@Output() pointClick = new EventEmitter<string>()` — emits the date label (no-op handler in Phase 1)
- Builds an echarts options object with:
  - `xAxis: { type: 'category', data: trend.dates }`
  - `yAxis: { type: 'value' }`
  - One `series` of type `'line'`, smooth, with an area gradient using `echarts.graphic.LinearGradient` (the v4 API — same as v5 but worth pinning)
  - A `markLine` for the average value (`trend.average`)
  - `tooltip: { trigger: 'axis' }` with a custom HTML formatter that uses Fira Code for the value
- Color comes from `--app-primary` resolved at options-build time via `getComputedStyle(document.documentElement).getPropertyValue('--app-primary')` — echarts can't read CSS vars directly

### `DonutChartComponent`

- `@Input() title: string`
- `@Input() data: DonutDatum[]` (`{ name: string; value: number; color?: string }`)
- `@Input() loading: boolean = false`
- `@Output() segmentClick = new EventEmitter<string>()`
- echarts pie chart with `radius: ['60%', '80%']` (donut hole), labels below, legend on the right
- Default color palette is the design's slate ramp + accent colors from `_variables.scss` — read via `getComputedStyle` at build time
- "Total" displayed in the center via a `graphic.text` element computed from `sum(data.values)`

### `HorizontalBarChartComponent`

- `@Input() title: string`
- `@Input() data: BarDatum[]` (`{ label: string; value: number }`)
- `@Input() loading: boolean = false`
- `@Output() barClick = new EventEmitter<string>()`
- echarts bar chart with `xAxis: { type: 'value' }`, `yAxis: { type: 'category', data: labels, inverse: true }` (so the highest value is on top)
- Limit to top 10 — if `data.length > 10`, slice; the consumer (Overview tab) already requests `limit=10` from the backend, but defense-in-depth

All three wrappers add to `SharedModule.declarations` and `SharedModule.exports` (Phase 0 already imports `NgxEchartsModule`).

---

## 10. KPI card system — data binding

Phase 0 shipped the styles in `_kpi-cards.scss`. Phase 1 ships the component:

```ts
@Component({
  selector: 'app-kpi-card',
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value: string = '';        // pre-formatted by caller
  @Input() delta: number | null = null;
  @Input() subtext: string | null = null;
  @Input() loading = false;

  get deltaClass(): string {
    if (this.delta === null) { return ''; }
    if (this.delta >= 0.1) { return 'is-up'; }
    if (this.delta <= -0.1) { return 'is-down'; }
    return 'is-flat';
  }
}
```

Template:

```html
<article class="kpi-card" [class.kpi-card--loading]="loading">
  <span class="kpi-label">{{ label }}</span>

  <ng-container *ngIf="!loading">
    <div class="kpi-value">{{ value }}</div>

    <div class="kpi-delta" *ngIf="delta !== null" [class]="deltaClass">
      <ng-container [ngSwitch]="deltaClass">
        <span *ngSwitchCase="'is-up'">↑</span>
        <span *ngSwitchCase="'is-down'">↓</span>
        <span *ngSwitchCase="'is-flat'">·</span>
      </ng-container>
      {{ delta | number:'1.1-1' }}%
    </div>

    <div class="kpi-subtext" *ngIf="subtext">{{ subtext }}</div>
  </ng-container>

  <ng-container *ngIf="loading">
    <div class="kpi-skeleton-value"></div>
    <div class="kpi-skeleton-foot"></div>
  </ng-container>
</article>
```

Note `*ngIf` and `[ngSwitch]` (Angular 8 control flow). Not `@if` / `@switch`.

The caller pre-formats the value — we don't ship a `compactNumber` pipe in Phase 1. Inline formatting for the four KPIs:

```ts
formatCount(n: number): string {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000)     { return (n / 1_000).toFixed(1) + 'k'; }
  return String(n);
}
```

Lives in `OverviewTabComponent` (or a tiny `utils/format.ts`). When tab 2+ adds the same need, promote to a real pipe.

---

## 11. Routing — nested routes for dashboard tabs

```ts
// app-routing.module.ts (only the dashboard line changes from Phase 0)
{
  path: 'dashboard',
  canActivate: [AuthGuard],
  loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule),
},

// dashboard-routing.module.ts (new)
const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        component: OverviewTabComponent,
        data: { title: 'Overview' },
      },
      // Phase 2+ will slot in here:
      // { path: 'top10', loadChildren: () => import('./tabs/top10/top10.module').then(m => m.Top10Module), data: { title: 'Top 10' } },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
```

`route.data.title` is read by `NavigationStore` (subscribed to `Router.events` filtered for `NavigationEnd` + `ActivationEnd`) and rendered in the top-bar breadcrumb.

Updating `home.component.ts` — the existing `tiles[0]` already has `route: '/dashboard'`. The `go()` handler navigates there; with this phase, the route now resolves to the real Overview tab instead of the placeholder. No changes needed to `home.component.ts` — the routing layer is what changed.

---

## 12. Visual design notes — "Operations Console" tokens

All Phase 1 components consume the design tokens already established in Phase 0. No new tokens are introduced.

| Surface | Token | Notes |
|---|---|---|
| KPI card background | `var(--app-surface)` | Light: white; dark: slate-900 |
| KPI card border | `var(--app-border)` | 1 px |
| KPI card primary stripe | `var(--app-primary)` | 3 px left edge — already in `_kpi-cards.scss` |
| KPI label | `var(--app-text-faint)`, `var(--font-sans)`, uppercase, `letter-spacing: var(--tracking-widest)` | |
| KPI value | `var(--app-text)`, `var(--font-mono)`, `font-feature-settings: 'tnum' 1, 'cv01' 1` | Tabular numbers, alt 1 |
| KPI delta up | `var(--app-success)` | Green |
| KPI delta down | `var(--app-danger)` | Red |
| Chart titles | `var(--app-text)`, `var(--font-sans)`, `font-weight: 500` | |
| Chart axis labels | `var(--app-text-faint)`, `var(--font-mono)`, 10 px | Fira Code for tick marks |
| Filter bar | `var(--app-surface)` background, `var(--app-border)` bottom border | Sticky-top within `<app-dashboard>` |
| Selected filter chips | Soft variant of `var(--app-primary)` via `color-mix(in oklch, var(--app-primary) 12%, transparent)` | |

**No purple-on-white gradients, no rainbow KPI cards, no Inter font, no generic Material 3 tokens.** These are the AI-default moves explicitly rejected during Phase 0 — see `design_direction.md`.

Per-tenant primary cascades automatically — `AppComponent` already sets `--app-primary` from `TenantStore.tenant$.primaryColor`. KPI stripe, chart accent colors (resolved via `getComputedStyle`), and selected-chip backgrounds all derive from the same root variable.

### Layout

The Overview tab uses a 12-column PrimeFlex grid:

| Row | Layout |
|---|---|
| 1 | 4 KPI cards, 3 columns each (`p-col-3`) on ≥ 1280 px; 2 cards per row at 768–1280 px; 1 card per row below |
| 2 | Daily PRM Trend (line chart, `p-col-8`), Service Type Breakdown (donut, `p-col-4`) on ≥ 1024 px; stacked below |
| 3 | Top Airlines (horizontal bar, `p-col-12`) — full-width |

`p-col-*` classes come from PrimeFlex 1.3.1 (already imported in `styles.scss`). The grid container is `.p-grid`.

---

## 13. Risks / open questions

### Phase 1 specific

- **R-P1-1 — Chart-color resolution from CSS variables.** echarts can't read CSS custom properties; we resolve `--app-primary` via `getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim()` at options-build time. If `AppComponent` hasn't yet written the tenant primary by the time the chart mounts (race), the chart paints in the default fallback `#2563EB`. *Mitigation:* `OverviewTabComponent.ngOnInit` already runs after route navigation, which is gated on `TenantResolver`, which sets the tenant before nav. Verify in browser smoke; if flaky, push the tenant write into `APP_INITIALIZER` so it lands before any feature module instantiates.
- **R-P1-2 — `p-multiSelect` styling drift on Windows Chrome.** PrimeNG 8.0.3's multi-select dropdown panel can flicker in nested scroll containers. *Mitigation:* set `[appendTo]="'body'"` on every multi-select to portal the panel out of the filter bar.
- **R-P1-3 — `p-overlayPanel` keyboard accessibility.** PrimeNG 8 doesn't trap focus inside overlay panels. The date-range picker's preset list and calendar are both keyboard-focusable; just verify Tab cycles cleanly. If not, ship the basics in Phase 1 and treat polish as Phase 6.
- **R-P1-4 — `forkJoin` partial failure.** If any of the five endpoints 500s, `forkJoin` errors and we lose the others. The Angular 17 code accepts this — the Phase 0 acceptance smoke didn't flag any flakiness. *Mitigation:* leave as-is for Phase 1; document known limitation. Phase 6 can swap in `forkJoin` of `catchError`-wrapped streams if it becomes a real issue.
- **R-P1-5 — DTO drift.** This is the biggest risk per Phase 0 lessons. *Mitigation:* Task 0 of the plan mandates reading the C# DTO files first; the spec's [§5](#5-new-types-and-shapes) lists the exact field names; acceptance is browser-based smoke against a real backend.

### Open questions for the user

- **OQ-P1-1** — The Angular 17 source has 5 KPI cards (Total PRM, Active Agents, Avg/Agent/Day, Avg Duration, Fulfillment). Phase 1 spec ships **4** (Total, Agents, Duration, Fulfillment) — dropping "Avg Services / Agent / Day". Backend `KpiSummaryResponse` already returns the data (`avgServicesPerAgentPerDay`), so adding the fifth card is a one-line cost. **Should we ship 5 in Phase 1, or hold for Phase 6 polish?** Defaulting to 4 to keep scope tight; happy to widen if user disagrees.
- **OQ-P1-2** — Drill-down from chart click → filter mutation. Angular 17 source has it (click a service-type donut segment → set `filters.service`); Phase 1 spec defers to Phase 6. **Confirm.** Easy to add, but doubles the test surface and adds a Toast dependency.
- **OQ-P1-3** — Period-over-period overlay on the line chart (the dashed previous-period line). Angular 17 has `DEMO_ANNOTATIONS`. Phase 1 ships only the `markLine` for the average. **Confirm.** Real PoP would need a second backend trip per filter change.

---

## 14. Acceptance criteria

Phase 1 ships when **all** of the following pass — checked in a real browser against the real Docker stack, not just curl:

### Build & lint

- [ ] `docker compose run --rm frontend-dev npm run lint` — clean (no errors; warnings OK)
- [ ] `docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json` — zero errors
- [ ] `docker compose run --rm frontend-dev npx ng build --configuration=production` — clean; initial bundle within 5 MB error budget
- [ ] `docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox` — all tests pass; total count ≥ 30 (Phase 0 baseline 21 + ~9 from Phase 1 component specs)

### Smoke (browser, full Docker stack via `docker compose up -d --build`)

- [ ] Login as a known seed credential at `http://aeroground.localhost:4200`
- [ ] Click the PRM Dashboard tile on `/home` → lands on `/dashboard/overview` (note the trailing `/overview` — child route)
- [ ] **Filter bar:**
  - [ ] Airport selector pre-selects the user's first airport; the option list shows only airports in the JWT claim (verify by attempting to add `?airport=HYD` — if HYD isn't in the claim, dashboard 403s and shows error state)
  - [ ] Airline / service / handled-by multi-selects populate from `/prm/filters/options` (check Network tab — request fires once on mount, again when airport set changes)
  - [ ] Date-range picker shows "Month to Date" by default with the resolved date-range mono-formatted in the trigger
  - [ ] Clicking a preset closes the panel and the URL updates with new `date_from` / `date_to` query params
  - [ ] Custom range via `p-calendar` works; URL updates accordingly
- [ ] **KPI cards:** all 4 render numeric values (not `—`); deltas show up/down/flat correctly; loading skeleton appears during a filter change and resolves within ~500 ms
- [ ] **Charts:** all 3 render with non-empty data on the default filter; loading skeleton appears during refetch
- [ ] **URL sync:** copy the URL, paste in a new tab while logged in → identical filter state restores
- [ ] **Reload:** F5 the page → filter state preserved
- [ ] **Theme toggle:** click theme toggle → light ↔ dark — chart colors re-resolve from CSS vars (no caching of stale palettes)
- [ ] **Per-tenant primary:** log in as a different tenant (e.g. switch subdomain) → KPI stripes, chart accents, filter chips all use that tenant's `primaryColor`
- [ ] **Empty state:** narrow the filters to a date range with no services → all charts show "No data matches current filters"
- [ ] **Browser console:** zero errors, zero warnings (some PrimeNG 8 deprecation warnings from upstream are OK; document if they appear)

### Regression

- [ ] All Phase 0 smoke checks still pass (login, home, theme toggle, smoke page at `/_smoke`, 404 page)
- [ ] `data/master/employees.csv` not modified; backend unchanged

### Definition of done

- [ ] Spec [§14 — acceptance criteria](#14-acceptance-criteria) all green
- [ ] Plan tasks all checked off
- [ ] One commit per logical unit (see plan task breakdown — ~13 commits expected)
- [ ] Working tree clean after the final commit
- [ ] Tag `v0.1.0-phase1` on the head of `angular-8-rewrite` (mirrors Phase 0's `v0.0.1-phase0` tagging convention)

---

## 15. References

- [Phase 0 spec](./2026-05-05-angular-8-primeng-rewrite-design.md) — foundational decisions
- [Phase 0 plan](../plans/2026-05-05-angular-8-rewrite-phase-0.md) — task format, dev-container conventions
- [`prm-domain` skill](../../../.claude/skills/prm-domain/) — IATA SSR codes, HHMM time encoding, dedup pattern, time-of-day bins, airline region color coding
- [`phase0_dto_alignment_lessons.md`](../../../.claude/memory/phase0_dto_alignment_lessons.md) — five integration bugs from inventing DTO shapes; mandatory reading before Task 0
- [`primeng_8_class_prefix.md`](../../../.claude/memory/primeng_8_class_prefix.md) — `.ui-*` class names for PrimeNG 8.0.3
- [`design_direction.md`](../../../.claude/memory/design_direction.md) — "Operations Console" design system; rejected alternatives
- [`runtime_docker.md`](../../../.claude/memory/runtime_docker.md) — Docker-only runtime convention
- Backend DTO files (mandatory reading for Task 0 of the plan):
  - `backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs`
  - `backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs`
  - `backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs`
  - `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs`
  - `backend/src/PrmDashboard.Shared/DTOs/PrmFilterParams.cs`
- Backend controllers (route + query-param shape source of truth):
  - `backend/src/PrmDashboard.PrmService/Controllers/KpisController.cs` (`/prm/kpis/summary`)
  - `backend/src/PrmDashboard.PrmService/Controllers/TrendsController.cs` (`/prm/trends/daily`)
  - `backend/src/PrmDashboard.PrmService/Controllers/RankingsController.cs` (`/prm/rankings/airlines`, `/prm/rankings/services`)
  - `backend/src/PrmDashboard.PrmService/Controllers/FiltersController.cs` (`/prm/filters/options`)

After Phase 1 is verified, Phase 2 (Top 10 tab) is the next slice. Spec + plan to follow with: *"Write the Phase 2 spec and plan."*
