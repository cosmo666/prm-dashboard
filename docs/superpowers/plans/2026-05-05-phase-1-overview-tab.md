# Angular 8 + PrimeNG Rewrite — Phase 1 (Overview Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First fully working dashboard tab on `angular-8-rewrite`. The Overview tab renders against a real backend with URL-synced filters, RBAC-scoped airport selector, 16-preset date-range picker, 5 KPI cards, and 3 charts (line with PoP overlay / donut / horizontal-bar). Bar and donut clicks drill into `FilterStore` (toggle airline / service). Acceptance is a real browser smoke pass — not just curl — against the full Docker stack.

**Reference spec:** [docs/superpowers/specs/2026-05-05-phase-1-overview-tab.md](../specs/2026-05-05-phase-1-overview-tab.md). Where the spec specifies behaviour, types, or design tokens, this plan refers to spec sections rather than re-printing.

**Builds on:** [Phase 0 plan](./2026-05-05-angular-8-rewrite-phase-0.md) — the dev-container workflow, PrimeNG 8 `.ui-*` overrides, BaseChartComponent, FormFieldComponent, and AuthStore/TenantStore are already in place. This plan extends, never replaces.

---

## Standing rules for Phase 1

These apply to **every** task. Re-read them before starting work each day.

### 1. All npm / ng / tsc invocations run inside the dev container

The user's host has Node 22; Angular CLI 8 needs Node 12. The Phase 0 dev container (`Dockerfile.dev`, `dev` compose profile) is the only Node 12 environment available. Pattern from worktree root:

```powershell
docker compose run --rm frontend-dev <command>
```

Do **not** suggest `cd frontend && npm install` or `ng serve`. Type-check uses the `-p tsconfig.app.json` form so it doesn't walk `node_modules/@types/undici-types` (whose modern TS 4.x syntax breaks TS 3.4.5).

### 2. Read backend DTOs before writing any frontend interface

Phase 0 acceptance caught **five** integration bugs from inventing DTO field names that didn't match what the backend serialises. The fix cost was much higher than the cost of one extra file read. See [`phase0_dto_alignment_lessons.md`](../../../.claude/memory/phase0_dto_alignment_lessons.md). The standing protocol:

1. Open the C# record in `backend/src/PrmDashboard.Shared/DTOs/*.cs`
2. Open the controller in `backend/src/PrmDashboard.PrmService/Controllers/*.cs` to confirm the route + query-param binding
3. Lowercase the first letter of each field (ASP.NET serialises C# PascalCase to camelCase)
4. **Then** write the TypeScript interface — verbatim, no embellishment

Task 0 below restates this protocol for the agent's first read; honour it for every new endpoint touched.

### 3. Acceptance is browser-based smoke against the real Docker stack

Not curl. Not `forkJoin` mocks. **`docker compose up -d --build`** then drive the app with a real browser at `http://aeroground.localhost:4200`. The five Phase 0 bugs were all things the unit tests passed and the curl-script smoke missed but a browser visit caught immediately.

### 4. TS 3.4.5 quirks

No `?.`, no `??`, no `import type`, no `||=` / `??=`, no `satisfies`, no template literal types. Use ternaries / `||` / `obj && obj.prop`. TSLint will warn; `npx tsc --noEmit -p tsconfig.app.json` is the authoritative gate.

### 5. PrimeNG 8.0.3 uses `.ui-*` selectors

Not `.p-*`. Any new override goes in `frontend/src/styles/primeng-overrides.scss` (loaded last so same-specificity wins). See `primeng_8_class_prefix.md`.

### 6. NgModules + function-form `loadChildren`

```ts
loadChildren: () => import('./features/x/x.module').then(m => m.XModule)
```

No standalone components. No string-form `loadChildren`. No `signal()` / `computed()` / `effect()` / `inject()`.

### 7. One concept per commit, descriptive message, Co-Authored-By trailer

Every commit ends with:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Commit messages use imperative mood and a `feat(scope):` / `fix(scope):` / `chore(scope):` prefix. ~13 commits expected end-to-end.

---

## File structure for Phase 1

```text
frontend/src/app/
├── core/
│   └── store/
│       ├── filter.store.ts                         # NEW (T2)
│       ├── filter.store.spec.ts                    # NEW (T2)
│       ├── navigation.store.ts                     # NEW (T10)
│       └── navigation.store.spec.ts                # NEW (T10)
│
├── features/
│   └── dashboard/                                  # NEW directory tree
│       ├── dashboard.module.ts                     # T10
│       ├── dashboard-routing.module.ts             # T11
│       ├── dashboard.component.{ts,html,scss}      # T9
│       ├── dashboard.component.spec.ts             # T9
│       ├── components/
│       │   ├── airport-selector/
│       │   │   └── airport-selector.component.{ts,html,scss}      # T4
│       │   ├── filter-bar/
│       │   │   └── filter-bar.component.{ts,html,scss,spec.ts}    # T4
│       │   ├── date-range-picker/
│       │   │   └── date-range-picker.component.{ts,html,scss}     # T3
│       │   └── kpi-card/
│       │       └── kpi-card.component.{ts,html,scss,spec.ts}      # T5
│       ├── services/
│       │   ├── prm-data.service.ts                 # T1
│       │   ├── prm-data.service.spec.ts            # T1
│       │   └── prm-dtos.ts                         # T1
│       ├── utils/
│       │   ├── date-presets.ts                     # T3 (port verbatim)
│       │   └── poc-today.ts                        # T3
│       └── tabs/
│           └── overview/
│               └── overview-tab.component.{ts,html,scss,spec.ts}  # T9
│
└── shared/
    ├── shared.module.ts                            # MODIFIED in T6/T7/T8 (declarations + exports)
    └── charts/
        ├── line-chart/
        │   └── line-chart.component.{ts,html,spec.ts}              # T6
        ├── donut-chart/
        │   └── donut-chart.component.{ts,html,spec.ts}             # T7
        └── horizontal-bar-chart/
            └── horizontal-bar-chart.component.{ts,html,spec.ts}    # T8
```

Out of Phase 1 scope (later phases): `tabs/top10/`, `tabs/service-breakup/`, `tabs/fulfillment/`, `tabs/insights/`, `charts/sankey-chart/`, `charts/heatmap-chart/`, `core/store/saved-views.store.ts`, `shared/components/saved-views-menu/`, `shared/components/command-palette/`, `shared/pipes/compact-number.pipe.ts`, period-over-period overlays, chart-click drill-down handlers (events emitted but no-op).

---

## Task 0: Read backend DTOs and controllers (5 minutes — required)

**Files to read (do not modify):**

- `backend/src/PrmDashboard.Shared/DTOs/KpiDtos.cs`
- `backend/src/PrmDashboard.Shared/DTOs/TrendDtos.cs`
- `backend/src/PrmDashboard.Shared/DTOs/RankingDtos.cs`
- `backend/src/PrmDashboard.Shared/DTOs/BreakdownDtos.cs` (also contains `FilterOptionsResponse`)
- `backend/src/PrmDashboard.Shared/DTOs/PrmFilterParams.cs`
- `backend/src/PrmDashboard.PrmService/Controllers/KpisController.cs`
- `backend/src/PrmDashboard.PrmService/Controllers/TrendsController.cs`
- `backend/src/PrmDashboard.PrmService/Controllers/RankingsController.cs`
- `backend/src/PrmDashboard.PrmService/Controllers/BreakdownsController.cs`
- `backend/src/PrmDashboard.PrmService/Controllers/FiltersController.cs`

The seven endpoints we'll consume in Phase 1:

| Endpoint (after `/api`) | Backend record | Used in T1 method |
|---|---|---|
| `GET /prm/kpis/summary` | `KpiSummaryResponse` | `kpisSummary()` |
| `GET /prm/trends/daily?metric=count` | `DailyTrendResponse` | `trendsDaily()` |
| `GET /prm/rankings/airlines?limit=10` | `RankingsResponse` | `topAirlines()` |
| `GET /prm/rankings/services` | `RankingsResponse` | `topServices()` |
| `GET /prm/filters/options?airport=DEL,BOM` | `FilterOptionsResponse` | `filterOptions()` |

The `?airport=…` query param is **mandatory** for `/prm/filters/options` (controller returns 400 otherwise — see `FiltersController.GetOptions`). All other endpoints accept the full `PrmFilterParams` shape from `PrmFilterParams.cs`.

- [ ] **Step 1: Read every file in the list above. Note each record's exact field names. Note that ASP.NET Core serialises C# PascalCase to camelCase JSON.**

- [ ] **Step 2: Confirm the wire shape of `KpiSummaryResponse` matches spec [§5](../specs/2026-05-05-phase-1-overview-tab.md#5-new-types-and-shapes).**

  If the spec and the C# record disagree, **the C# record wins**. Update the spec via a follow-up commit before T1.

- [ ] **Step 3: Note that `RankingItem` and `BreakdownItem` are structurally identical** (`label`, `count`, `percentage`) but distinct types. We import both into `prm-dtos.ts`.

- [ ] **Step 4: Note the `handled_by` URL-param key (snake_case) vs the JSON `handledBy` field (camelCase) in `FilterOptionsResponse`.** The frontend uses `handled_by` in URL params (matches `PrmFilterParams.HandledBy`'s `[FromQuery]` binding) and `handledBy` in JS objects.

No commit for this task — it's reading-only. Check off the boxes by replying with one-line confirmations to whomever asked.

---

## Task 1: PRM data service (`prm-data.service.ts` + `prm-dtos.ts`)

**Files:**
- Create: `frontend/src/app/features/dashboard/services/prm-dtos.ts`
- Create: `frontend/src/app/features/dashboard/services/prm-data.service.ts`
- Create: `frontend/src/app/features/dashboard/services/prm-data.service.spec.ts`

- [ ] **Step 1: Write `prm-dtos.ts`**

Mirror the backend records read in Task 0. Copy the interfaces from spec [§5 — New types and shapes](../specs/2026-05-05-phase-1-overview-tab.md#5-new-types-and-shapes) verbatim.

Add a `// Source: backend/src/PrmDashboard.Shared/DTOs/<file>.cs` comment above each interface so future readers can find the C# definition in one click.

- [ ] **Step 2: Write `prm-data.service.ts`**

```ts
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiClient } from 'src/app/core/api/api.client';
import { FilterStore } from 'src/app/core/store/filter.store';
import {
  KpiSummaryResponse,
  DailyTrendResponse,
  RankingsResponse,
  FilterOptionsResponse,
} from './prm-dtos';

/**
 * Phase 1: wraps the 5 endpoints needed for the Overview tab. Adds a sixth
 * call (`trendsDailyPrev`) for the period-over-period overlay on the trend
 * line chart — see OQ-P1-3 in the spec.
 *
 * NOT @Injectable({ providedIn: 'root' }) — provided by DashboardModule
 * so the service lives in the lazy injector. See spec §4 P1-Q8.
 */
@Injectable()
export class PrmDataService {
  constructor(
    private api: ApiClient,
    private filters: FilterStore,
  ) {}

  /** Build the query-params dict from FilterStore + optional extras. */
  private params(extra: { [key: string]: string | number | null | undefined } = {}): { [key: string]: string } {
    // FilterStore.queryParams$ is an Observable; here we want the snapshot.
    const base: { [key: string]: string } = {
      ...(this.filters.airportSnapshot.length > 0 ? { airport: this.filters.airportSnapshot.join(',') } : {}),
      ...(this.filters.dateFromSnapshot ? { date_from: this.filters.dateFromSnapshot } : {}),
      ...(this.filters.dateToSnapshot ? { date_to: this.filters.dateToSnapshot } : {}),
      ...(this.filters.airlineSnapshot.length > 0 ? { airline: this.filters.airlineSnapshot.join(',') } : {}),
      ...(this.filters.serviceSnapshot.length > 0 ? { service: this.filters.serviceSnapshot.join(',') } : {}),
      ...(this.filters.handledBySnapshot.length > 0 ? { handled_by: this.filters.handledBySnapshot.join(',') } : {}),
    };
    for (const key of Object.keys(extra)) {
      const v = extra[key];
      if (v !== null && v !== undefined) {
        base[key] = String(v);
      }
    }
    return base;
  }

  kpisSummary(): Observable<KpiSummaryResponse> {
    return this.api.get<KpiSummaryResponse>('/prm/kpis/summary', this.params());
  }

  trendsDaily(metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    return this.api.get<DailyTrendResponse>('/prm/trends/daily', this.params({ metric }));
  }

  /**
   * Period-over-period overlay (OQ-P1-3). Backend has no `prev=true` flag on
   * /prm/trends/daily — we shift the date_from/date_to to the previous comparable
   * period and re-issue. Mirrors the backend's `BaseQueryService.GetPrevPeriodStart`
   * convention: prev_end = from.AddDays(-1); prev_from = prev_end - (to - from).
   * Returns null-equivalent (empty `values`) when from/to aren't both set.
   */
  trendsDailyPrev(metric: 'count' | 'duration' | 'agents' = 'count'): Observable<DailyTrendResponse> {
    const fromIso = this.filters.dateFromSnapshot;
    const toIso = this.filters.dateToSnapshot;
    if (!fromIso || !toIso) {
      return of({ dates: [], values: [], average: 0 } as DailyTrendResponse);
    }
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const spanMs = to.getTime() - from.getTime();
    const prevEnd = new Date(from.getTime() - 86400000);          // from - 1 day
    const prevFrom = new Date(prevEnd.getTime() - spanMs);
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    const params = this.params({ metric });
    params['date_from'] = iso(prevFrom);
    params['date_to']   = iso(prevEnd);
    return this.api.get<DailyTrendResponse>('/prm/trends/daily', params);
  }

  topAirlines(limit: number = 10): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/airlines', this.params({ limit }));
  }

  topServices(): Observable<RankingsResponse> {
    return this.api.get<RankingsResponse>('/prm/rankings/services', this.params());
  }

  /** /prm/filters/options requires `?airport=...` (no other filters). */
  filterOptions(): Observable<FilterOptionsResponse> {
    return this.api.get<FilterOptionsResponse>('/prm/filters/options', {
      airport: this.filters.airportSnapshot.join(','),
    });
  }
}
```

Note carefully: `FilterStore` is referenced but doesn't exist yet — T2 creates it. **The plan order is intentional:** writing `PrmDataService` first crystallises the FilterStore's required snapshot API. T2 will write the store to match.

- [ ] **Step 3: Write the service spec**

`prm-data.service.spec.ts` — sanity test only. Stubs `ApiClient` and `FilterStore`, asserts that `kpisSummary()` calls `api.get('/prm/kpis/summary', expected-params)`.

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PrmDataService } from './prm-data.service';
import { ApiClient } from 'src/app/core/api/api.client';
import { FilterStore } from 'src/app/core/store/filter.store';

describe('PrmDataService', () => {
  let service: PrmDataService;
  let apiSpy: jasmine.SpyObj<ApiClient>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiClient>('ApiClient', ['get', 'post', 'delete']);
    apiSpy.get.and.returnValue(of({ totalPrm: 0 } as any));

    const filterStub: Partial<FilterStore> = {
      airportSnapshot: ['DEL', 'BOM'],
      dateFromSnapshot: '2026-04-01',
      dateToSnapshot: '2026-04-30',
      airlineSnapshot: [],
      serviceSnapshot: [],
      handledBySnapshot: [],
    };

    TestBed.configureTestingModule({
      providers: [
        PrmDataService,
        { provide: ApiClient, useValue: apiSpy },
        { provide: FilterStore, useValue: filterStub },
      ],
    });
    service = TestBed.inject(PrmDataService);
  });

  it('kpisSummary calls /prm/kpis/summary with airport+date params', () => {
    service.kpisSummary().subscribe();
    expect(apiSpy.get).toHaveBeenCalledWith('/prm/kpis/summary', {
      airport: 'DEL,BOM',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
  });

  it('topAirlines passes limit', () => {
    service.topAirlines(7).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/rankings/airlines');
    expect(args[1]['limit']).toBe('7');
  });

  it('filterOptions passes only airport', () => {
    service.filterOptions().subscribe();
    expect(apiSpy.get).toHaveBeenCalledWith('/prm/filters/options', { airport: 'DEL,BOM' });
  });
});
```

- [ ] **Step 4: Type-check**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
```

Expected: error pointing at the missing `FilterStore` import. That's fine — T2 fixes it. Suppress this round of failures by deferring the actual type-check until T2.

- [ ] **Step 5: Commit (deferred verification)**

```powershell
git add frontend/src/app/features/dashboard/services
git commit -m "feat(dashboard): add PrmDataService + DTOs for the 5 Overview endpoints

Mirrors backend DTOs in PrmDashboard.Shared/DTOs (verified in Task 0 of
Phase 1 plan). Service is module-provided (not providedIn:'root') so it
lives in the lazy DashboardModule injector.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: FilterStore (BehaviorSubject service, URL-syncable)

**Files:**
- Create: `frontend/src/app/core/store/filter.store.ts`
- Create: `frontend/src/app/core/store/filter.store.spec.ts`

- [ ] **Step 1: Write the store**

Implement the full shape from spec [§7 — FilterStore design](../specs/2026-05-05-phase-1-overview-tab.md#7-filterstore--design). Snapshot getters, observables, `combineLatest`-based `queryParams$`, mutation methods, `hydrateFromQueryParams`, `applyDefault`.

Key invariants the spec calls out:

- `queryParams$` uses `shareReplay(1)` so multiple subscribers don't trigger redundant `combineLatest` recomputes
- `setAirport` accepts `string | string[] | null` via the `normalize` helper (mirrors Angular 17 contract)
- `toggleAirport` enforces the never-empty rule: if removing the code would empty the array, return without mutating
- `toggleAirline(code)` and `toggleService(code)` — drill-down from chart clicks (OQ-P1-2). If `code` is in the current array, remove it; otherwise push it. **No** never-empty rule on these — empty array means "no filter", which is valid (and unlike airport, the backend doesn't 400 on an empty airline/service list)
- `applyDefault()` calls `resolvePreset('mtd', POC_TODAY)` (the helper exists in Angular 17 source — port verbatim in T3)
- `hydrateFromQueryParams(params)` parses CSVs via a private `parseCsv` helper

Date-preset enum values match backend wire format (snake_case): `today`, `yesterday`, `last7`, `last30`, `mtd`, `last_month`, etc.

- [ ] **Step 2: Write the spec**

`filter.store.spec.ts` covers:
- Initial state matches spec
- `setAirport(['DEL','BOM'])` → `airportSnapshot === ['DEL','BOM']`
- `setAirport('DEL')` → `airportSnapshot === ['DEL']`
- `setAirport(null)` → `airportSnapshot === []`
- `toggleAirport('DEL')` adds when absent, removes when present
- `toggleAirport(<last>)` is a no-op (never-empty rule)
- `removeAirport('DEL')` filters out
- `setAirline(['AI','BA'])` works
- `toggleAirline('AI')` adds to empty list, `toggleAirline('AI')` again removes (no never-empty rule on airline)
- `toggleService('WCHR')` adds to empty list, `toggleService('WCHR')` again removes (drill-down round-trip)
- `clearSecondary()` empties airline/service/handledBy/flight/agentNo but keeps airport+date
- `queryParams$` emits `{ airport: 'DEL', date_from: '...', date_to: '...' }` with `mtd` defaults
- `queryParams$` omits keys for empty arrays
- `hydrateFromQueryParams({ airport: 'DEL,BOM', date_from: '2026-04-01' })` populates correctly
- Quirky case: `hydrateFromQueryParams({ airport: ',  ,DEL' })` → `['DEL']` (parseCsv trims + filters)

- [ ] **Step 3: Run tests**

```powershell
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/filter.store.spec.ts
```

Expected: all tests pass.

- [ ] **Step 4: Re-run type-check now that FilterStore exists**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
```

Expected: zero errors. T1's deferred error from `prm-data.service.ts` now resolves.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/core/store/filter.store.ts frontend/src/app/core/store/filter.store.spec.ts
git commit -m "feat(core): add FilterStore (BehaviorSubject + URL query-params derivation)

Mirrors the Angular 17 FilterStore on main but uses plain RxJS instead
of NgRx Signal Store. Spec §7 covers the design.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Date-range picker component (16 presets)

**Files:**
- Create: `frontend/src/app/features/dashboard/utils/date-presets.ts`
- Create: `frontend/src/app/features/dashboard/utils/poc-today.ts`
- Create: `frontend/src/app/features/dashboard/components/date-range-picker/date-range-picker.component.{ts,html,scss}`

- [ ] **Step 1: Port `date-presets.ts` verbatim from main**

```powershell
git show main:frontend/src/app/features/dashboard/utils/date-presets.ts > frontend/src/app/features/dashboard/utils/date-presets.ts
```

Then **adjust the imports** at the top:

- The file imports `DatePreset` from `core/store/filter.store` — that path is identical in this branch, so the line stays the same
- The file imports `environment.pocToday` — Phase 0 already added `pocToday` to `environment.ts`. Verify; if not, add it now: `pocToday: '2026-03-31'` in `environment.ts` and `pocToday: ''` in `environment.prod.ts`

The `resolvePreset()` function and `PRESET_DEFS` are framework-agnostic — no signal API, no decorators. Should compile under TS 3.4.5 unchanged.

- [ ] **Step 2: Extract `POC_TODAY` to its own file**

Move the `export const POC_TODAY = ...` block from `date-presets.ts` into `frontend/src/app/features/dashboard/utils/poc-today.ts`. Re-export it from `date-presets.ts`. The motivation: tests stub `POC_TODAY` more easily when it's a separate import.

- [ ] **Step 3: Write the date-range picker component**

Per spec [§8 — DateRangePickerComponent](../specs/2026-05-05-phase-1-overview-tab.md#daterangepickercomponent):

```ts
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { OverlayPanel } from 'primeng/overlaypanel';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PRESET_DEFS, resolvePreset, DatePreset } from '../../utils/date-presets';
import { POC_TODAY } from '../../utils/poc-today';

@Component({
  selector: 'app-date-range-picker',
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
})
export class DateRangePickerComponent implements OnInit, OnDestroy {
  @ViewChild('panel', { static: true }) panel!: OverlayPanel;

  presets = PRESET_DEFS;
  currentLabel = '';
  rangeDisplay = '';
  rangeValue: Date[] = [];        // for p-calendar [(ngModel)]

  private destroy$ = new Subject<void>();

  constructor(public filters: FilterStore) {}

  ngOnInit(): void {
    this.filters.datePreset$.pipe(takeUntil(this.destroy$))
      .subscribe(p => this.recomputeLabels(p));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectPreset(p: DatePreset, ev: Event): void {
    const r = resolvePreset(p, POC_TODAY);
    this.filters.setDateRange(p, r.from, r.to);
    this.panel.hide();
  }

  onCalendarSelect(): void {
    if (this.rangeValue.length === 2 && this.rangeValue[1]) {
      this.filters.setDateRange('custom', this.iso(this.rangeValue[0]), this.iso(this.rangeValue[1]));
    }
  }

  presetRange(p: DatePreset): string {
    const r = resolvePreset(p, POC_TODAY);
    if (!r.from || !r.to) { return ''; }
    return `${this.short(r.from)} – ${this.short(r.to)}`;
  }

  private recomputeLabels(p: DatePreset): void {
    const def = PRESET_DEFS.find(x => x.key === p);
    this.currentLabel = def ? def.label : '';
    this.rangeDisplay = `${this.short(this.filters.dateFromSnapshot)} – ${this.short(this.filters.dateToSnapshot)}`;
  }

  private iso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private short(iso: string): string {
    if (!iso) { return '—'; }
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
```

- [ ] **Step 4: Template**

```html
<button type="button" class="range-btn" (click)="panel.toggle($event)">
  <i class="pi pi-calendar"></i>
  <span class="range-btn__label">{{ currentLabel }}</span>
  <span class="range-btn__range font-mono">{{ rangeDisplay }}</span>
  <i class="pi pi-chevron-down"></i>
</button>

<p-overlayPanel #panel [showCloseIcon]="false" [appendTo]="'body'" styleClass="drp-panel">
  <div class="drp-wrap" (click)="$event.stopPropagation()">
    <div class="drp-presets">
      <div class="drp-presets__head">Quick presets</div>
      <ul class="drp-presets__list">
        <li *ngFor="let p of presets">
          <button type="button"
                  class="drp-preset"
                  [class.is-active]="(filters.datePreset$ | async) === p.key"
                  (click)="selectPreset(p.key, $event)">
            <span class="drp-preset__label">{{ p.label }}</span>
            <span class="drp-preset__range font-mono">{{ presetRange(p.key) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="drp-cal">
      <p-calendar
        [(ngModel)]="rangeValue"
        selectionMode="range"
        [inline]="true"
        [showWeek]="false"
        (onSelect)="onCalendarSelect()">
      </p-calendar>
    </div>
  </div>
</p-overlayPanel>
```

- [ ] **Step 5: Styles**

`.scss` is short — most styling is shared layout. Use spec [§12 — Visual design notes](../specs/2026-05-05-phase-1-overview-tab.md#12-visual-design-notes--operations-console-tokens) tokens. The `.range-btn` shows `currentLabel` (sans) on top + `rangeDisplay` (mono) below. The `.drp-wrap` is a flex row, presets on the left, calendar on the right at ≥768px; stacked below.

- [ ] **Step 6: Add OverlayPanel + Calendar modules to SharedModule**

`SharedModule` already exports `CalendarModule`. Add `OverlayPanelModule` (`primeng/overlaypanel`) to imports + exports.

- [ ] **Step 7: Type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
git add frontend/src/app/features/dashboard/utils frontend/src/app/features/dashboard/components/date-range-picker frontend/src/app/shared/shared.module.ts
git commit -m "feat(dashboard): add 16-preset date-range picker

Ports date-presets.ts verbatim from the Angular 17 source on main
(framework-agnostic). The picker wraps p-overlayPanel + p-calendar
range mode; preset list and calendar coexist in a single panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Filter bar + airport selector

**Files:**
- Create: `frontend/src/app/features/dashboard/components/airport-selector/airport-selector.component.{ts,html,scss}`
- Create: `frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.{ts,html,scss,spec.ts}`

- [ ] **Step 1: Airport selector**

Per spec [§8 — AirportSelectorComponent](../specs/2026-05-05-phase-1-overview-tab.md#airportselectorcomponent):

```ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, combineLatest } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { AuthStore, AirportInfo } from 'src/app/core/store/auth.store';
import { FilterStore } from 'src/app/core/store/filter.store';

interface SelectOption { label: string; value: string; }

@Component({
  selector: 'app-airport-selector',
  templateUrl: './airport-selector.component.html',
  styleUrls: ['./airport-selector.component.scss'],
})
export class AirportSelectorComponent implements OnInit, OnDestroy {
  options: SelectOption[] = [];
  value: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private authStore: AuthStore,
    private filters: FilterStore,
  ) {}

  ngOnInit(): void {
    // RBAC-scoped option list
    this.authStore.airports$.pipe(takeUntil(this.destroy$)).subscribe((airports: AirportInfo[]) => {
      this.options = airports.map(a => ({ label: `${a.name} (${a.code})`, value: a.code }));
    });

    // Two-way: filters.airport$ → component.value
    this.filters.airport$.pipe(takeUntil(this.destroy$)).subscribe(codes => {
      this.value = codes;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onChange(event: { value: string[] }): void {
    if (!event.value || event.value.length === 0) {
      // Never-empty rule — re-emit prior selection
      this.value = this.filters.airportSnapshot;
      return;
    }
    this.filters.setAirport(event.value);
  }
}
```

Template:

```html
<app-form-field label="Airport">
  <p-multiSelect
    [options]="options"
    [(ngModel)]="value"
    (onChange)="onChange($event)"
    [appendTo]="'body'"
    [filter]="true"
    [showHeader]="true"
    selectedItemsLabel="{0} airports">
  </p-multiSelect>
</app-form-field>
```

- [ ] **Step 2: Filter bar**

```ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

interface Opt { label: string; value: string; }

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
})
export class FilterBarComponent implements OnInit, OnDestroy {
  airlineOptions: Opt[] = [];
  serviceOptions: Opt[] = [];
  handledByOptions: Opt[] = [
    { label: 'Self', value: 'SELF' },
    { label: 'Outsourced', value: 'OUTSOURCED' },
  ];

  airline: string[] = [];
  service: string[] = [];
  handledBy: string[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    // Re-fetch options when the airport set changes
    this.filters.airport$.pipe(
      debounceTime(150),
      takeUntil(this.destroy$),
    ).subscribe(airport => {
      if (airport.length === 0) {
        this.airlineOptions = [];
        this.serviceOptions = [];
        return;
      }
      this.data.filterOptions().subscribe({
        next: r => {
          this.airlineOptions = (r.airlines || []).map(a => ({ label: a, value: a }));
          this.serviceOptions = (r.services || []).map(s => ({ label: s, value: s }));
        },
        error: () => { /* leave previous options in place; surfaces via error toast in Phase 6 */ },
      });
    });

    // Two-way bindings
    this.filters.airline$.pipe(takeUntil(this.destroy$)).subscribe(v => this.airline = v);
    this.filters.service$.pipe(takeUntil(this.destroy$)).subscribe(v => this.service = v);
    this.filters.handledBy$.pipe(takeUntil(this.destroy$)).subscribe(v => this.handledBy = v);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setAirline(ev: { value: string[] }): void   { this.filters.setAirline(ev.value); }
  setService(ev: { value: string[] }): void   { this.filters.setService(ev.value); }
  setHandledBy(ev: { value: string[] }): void { this.filters.setHandledBy(ev.value); }

  removeAirline(v: string): void   { this.filters.removeAirline(v); }
  removeService(v: string): void   { this.filters.removeService(v); }
  removeHandledBy(v: string): void { this.filters.removeHandledBy(v); }

  handledByLabel(v: string): string {
    if (v === 'SELF') { return 'Self'; }
    if (v === 'OUTSOURCED') { return 'Outsourced'; }
    return v;
  }

  clearAll(): void { this.filters.clearSecondary(); }
}
```

Template (the full file is ~80 lines — abbreviated here for the plan, but follow the same shape as Angular 17 `filter-bar.component.html` on main, swapping `mat-form-field` for `<app-form-field>` and `mat-select multiple` for `<p-multiSelect>`):

```html
<div class="filter-bar">
  <app-airport-selector class="fb-cell"></app-airport-selector>
  <app-date-range-picker class="fb-cell"></app-date-range-picker>

  <app-form-field label="Airline" class="fb-cell">
    <p-multiSelect [options]="airlineOptions" [(ngModel)]="airline" (onChange)="setAirline($event)" [appendTo]="'body'" [filter]="true"></p-multiSelect>
  </app-form-field>

  <app-form-field label="Service" class="fb-cell">
    <p-multiSelect [options]="serviceOptions" [(ngModel)]="service" (onChange)="setService($event)" [appendTo]="'body'" [filter]="true"></p-multiSelect>
  </app-form-field>

  <app-form-field label="Handled By" class="fb-cell">
    <p-multiSelect [options]="handledByOptions" [(ngModel)]="handledBy" (onChange)="setHandledBy($event)" [appendTo]="'body'"></p-multiSelect>
  </app-form-field>

  <button type="button" class="ui-button ui-button-secondary fb-clear" (click)="clearAll()" *ngIf="airline.length || service.length || handledBy.length">
    Clear
  </button>
</div>

<!-- Selected-value chips below the bar -->
<div class="filter-chips" *ngIf="airline.length || service.length || handledBy.length">
  <span class="filter-chip" *ngFor="let v of airline">
    Airline: {{ v }}
    <button type="button" class="filter-chip__close" (click)="removeAirline(v)" aria-label="Remove">×</button>
  </span>
  <span class="filter-chip" *ngFor="let v of service">
    Service: {{ v }}
    <button type="button" class="filter-chip__close" (click)="removeService(v)" aria-label="Remove">×</button>
  </span>
  <span class="filter-chip" *ngFor="let v of handledBy">
    {{ handledByLabel(v) }}
    <button type="button" class="filter-chip__close" (click)="removeHandledBy(v)" aria-label="Remove">×</button>
  </span>
</div>
```

- [ ] **Step 3: Filter bar spec**

`filter-bar.component.spec.ts` — sanity test only:

```ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { FilterBarComponent } from './filter-bar.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { AirportSelectorComponent } from '../airport-selector/airport-selector.component';
import { DateRangePickerComponent } from '../date-range-picker/date-range-picker.component';
import { SharedModule } from 'src/app/shared/shared.module';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('FilterBarComponent', () => {
  let fixture: ComponentFixture<FilterBarComponent>;
  // ... stubs ...
  it('renders a clear button only when secondary filters set', () => { /* ... */ });
});
```

(Full spec is ~50 lines — happy with a single render-without-throw test for Phase 1; broader coverage waits for Phase 6.)

- [ ] **Step 4: Type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/filter-bar.component.spec.ts
git add frontend/src/app/features/dashboard/components/airport-selector frontend/src/app/features/dashboard/components/filter-bar
git commit -m "feat(dashboard): airport selector + filter bar

Airport selector enforces the never-empty rule per spec §8. Filter bar
re-fetches /prm/filters/options when the airport set changes (debounced).
Multi-selects use [appendTo]='body' to portal panels out of the bar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: KPI card component

**Files:**
- Create: `frontend/src/app/features/dashboard/components/kpi-card/kpi-card.component.{ts,html,scss,spec.ts}`

- [ ] **Step 1: Component**

Per spec [§10 — KPI card system](../specs/2026-05-05-phase-1-overview-tab.md#10-kpi-card-system--data-binding). Pure presentational — toggles `kpi-card--loading` and `is-up`/`is-down`/`is-flat` classes; styles already live in `_kpi-cards.scss` from Phase 0.

The Overview tab renders **5 instances** of this component (OQ-P1-1 resolution): Total PRM Services, Active Agents, Avg svc / agent / day (`summary.avgServicesPerAgentPerDay`), Avg Duration (min), Fulfillment Rate. The component itself is generic — it doesn't know about any specific KPI; the binding lives in T9. Verify the component is purely input-driven (no card-specific switch statements inside).

- [ ] **Step 2: Spec**

`kpi-card.component.spec.ts`:

```ts
describe('KpiCardComponent', () => {
  it('renders label and value', () => { /* set inputs, query DOM, assert text */ });
  it('shows skeleton when loading=true', () => { /* assert .kpi-skeleton-value present */ });
  it('hides delta block when delta is null', () => { /* */ });
  it('uses is-up class when delta >= 0.1', () => { /* */ });
  it('uses is-down class when delta <= -0.1', () => { /* */ });
  it('uses is-flat class when -0.1 < delta < 0.1', () => { /* */ });
  it('renders subtext when provided', () => { /* */ });
});
```

7 tests.

- [ ] **Step 3: Run tests + type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/kpi-card.component.spec.ts
git add frontend/src/app/features/dashboard/components/kpi-card
git commit -m "feat(dashboard): add KpiCardComponent

Pure presentational wrapper around the _kpi-cards.scss styles shipped
in Phase 0. Caller pre-formats the value (no compactNumber pipe yet).
Delta classification: is-up (>=+0.1), is-flat (>-0.1..<+0.1), is-down (<=-0.1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: LineChartComponent

**Files:**
- Create: `frontend/src/app/shared/charts/line-chart/line-chart.component.{ts,html,spec.ts}`
- Modify: `frontend/src/app/shared/shared.module.ts`

- [ ] **Step 1: Component**

```ts
import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import * as echarts from 'echarts';
import { DailyTrendResponse } from 'src/app/features/dashboard/services/prm-dtos';

@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.component.html',
})
export class LineChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() trend: DailyTrendResponse | null = null;
  /**
   * Period-over-period overlay (OQ-P1-3). When non-null and non-empty, the chart
   * renders a second dotted line at 0.35 opacity in the primary hue. Hidden when
   * null or when values.length === 0 (very short ranges or first-month tenants).
   */
  @Input() secondarySeries: DailyTrendResponse | null = null;
  @Input() loading = false;
  @Input() height = 320;
  @Output() pointClick = new EventEmitter<string>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    if (!this.trend) { this.options = null; return; }
    const primary = this.resolvePrimary();
    const hasPrev = !!(this.secondarySeries && this.secondarySeries.values && this.secondarySeries.values.length > 0);

    const series: any[] = [{
      name: 'Current',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      data: this.trend.values,
      itemStyle: { color: primary },
      lineStyle:  { color: primary, width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: this.alphaHex(primary, 0.25) },
          { offset: 1, color: this.alphaHex(primary, 0.0) },
        ]),
      },
      markLine: {
        symbol: 'none',
        data: [{ yAxis: this.trend.average, lineStyle: { type: 'dashed', color: '#94a3b8' }, label: { formatter: `Avg ${this.trend.average.toFixed(0)}`, position: 'end' as const }}],
      },
    }];

    if (hasPrev) {
      // Render the prev-period values point-for-point against the current period's
      // x-axis. The OverviewTabComponent ensures lengths align; if the prev array
      // is shorter (e.g. month boundary), we right-pad with the last known value
      // so the line spans the full axis without an abrupt drop.
      const prev = this.secondarySeries!.values.slice(0, this.trend.values.length);
      while (prev.length < this.trend.values.length) {
        prev.push(prev[prev.length - 1] || 0);
      }
      series.push({
        name: 'Prev period',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: prev,
        itemStyle: { color: primary, opacity: 0.35 },
        lineStyle: { color: primary, width: 1.5, type: 'dotted', opacity: 0.35 },
      });
    }

    this.options = {
      tooltip: { trigger: 'axis' },
      legend:  hasPrev ? { data: ['Current', 'Prev period'], right: 0, top: 0, textStyle: { color: '#64748b' }} : undefined,
      grid:    { left: 40, right: 20, top: hasPrev ? 40 : 30, bottom: 40 },
      xAxis: { type: 'category', data: this.trend.dates, axisLine: { lineStyle: { color: '#cbd5e1' }} },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e2e8f0' }} },
      series,
    };
  }

  private resolvePrimary(): string {
    if (typeof document === 'undefined') { return '#2563EB'; }
    const v = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
    return v || '#2563EB';
  }

  /** Crude alpha-blend for hex/oklch primary. echarts area gradients want hex/rgba. */
  private alphaHex(color: string, alpha: number): string {
    // If color is in rgb()/rgba() or oklch(), wrap with rgba via canvas; cheap path: assume #RRGGBB
    if (color[0] === '#' && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
  }

  onChartClick(event: any): void {
    if (event && event.name) { this.pointClick.emit(event.name); }
  }
}
```

Template:

```html
<app-base-chart [title]="title" [loading]="loading" [options]="options" [height]="height"></app-base-chart>
```

(`(chartClick)` event wiring through `BaseChartComponent` is a Phase 6 concern. For Phase 1 we accept that point clicks aren't actionable.)

- [ ] **Step 2: Spec**

`line-chart.component.spec.ts` — render-without-throw + ngOnChanges populates `options`:

```ts
describe('LineChartComponent', () => {
  it('builds options with series.data matching trend.values', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01','2026-04-02'], values: [10, 12], average: 11 };
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeTruthy();
    expect((fixture.componentInstance.options!.series as any[])[0].data).toEqual([10, 12]);
  });

  it('options is null when trend is null', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = null;
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeNull();
  });

  it('renders a single series when secondarySeries is null', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01'], values: [10], average: 10 };
    fixture.componentInstance.secondarySeries = null;
    fixture.componentInstance.ngOnChanges();
    expect((fixture.componentInstance.options!.series as any[]).length).toBe(1);
  });

  it('renders a dotted prev-period series when secondarySeries has values (OQ-P1-3)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01','2026-04-02'], values: [10, 12], average: 11 };
    fixture.componentInstance.secondarySeries = { dates: ['2026-03-01','2026-03-02'], values: [8, 9], average: 8.5 };
    fixture.componentInstance.ngOnChanges();
    const series = fixture.componentInstance.options!.series as any[];
    expect(series.length).toBe(2);
    expect(series[1].name).toBe('Prev period');
    expect(series[1].lineStyle.type).toBe('dotted');
    expect(series[1].lineStyle.opacity).toBeCloseTo(0.35);
  });
});
```

- [ ] **Step 3: Register in SharedModule**

Add to declarations + exports.

- [ ] **Step 4: Type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/line-chart.component.spec.ts
git add frontend/src/app/shared/charts/line-chart frontend/src/app/shared/shared.module.ts
git commit -m "feat(charts): add LineChartComponent with PoP overlay support

Wraps BaseChartComponent. Builds EChartOption from a DailyTrendResponse
DTO directly (no intermediate shape). Resolves --app-primary at
build time via getComputedStyle since echarts can't read CSS variables.
Optional [secondarySeries] input renders a dotted, faint prev-period
overlay (OQ-P1-3) — null-safe; hidden when no prev data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: DonutChartComponent

**Files:**
- Create: `frontend/src/app/shared/charts/donut-chart/donut-chart.component.{ts,html,spec.ts}`
- Modify: `frontend/src/app/shared/shared.module.ts`

- [ ] **Step 1: Component**

```ts
export interface DonutDatum { name: string; value: number; color?: string; }

@Component({ selector: 'app-donut-chart', templateUrl: './donut-chart.component.html' })
export class DonutChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() data: DonutDatum[] = [];
  @Input() loading = false;
  @Input() height = 320;
  /**
   * Emits the segment payload on click — `OverviewTabComponent` wires this to
   * `filters.toggleService(name)` for the OQ-P1-2 drill-down.
   */
  @Output() segmentClick = new EventEmitter<{ name: string; value: number }>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    const total = this.data.reduce((a, b) => a + b.value, 0);
    this.options = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend:  { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 12 }},
      series: [{
        type: 'pie',
        radius: ['60%', '80%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { focus: 'series' },   // expands tap target — OQ-P1-2 hard requirement
        data: this.data.map(d => ({ name: d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
      } as any],
      graphic: [
        { type: 'text', left: '35%', top: '46%', style: { text: total.toLocaleString(), textAlign: 'center', fontSize: 22, fontWeight: 500, fill: '#0f172a' }},
        { type: 'text', left: '35%', top: '60%', style: { text: 'TOTAL', textAlign: 'center', fontSize: 10, fill: '#64748b' }},
      ],
    };
  }

  /** echarts click handler — wired via [chartClick]="onChartClick($event)" through BaseChartComponent's pass-through. */
  onChartClick(event: any): void {
    if (event && event.data && typeof event.data.name === 'string') {
      this.segmentClick.emit({ name: event.data.name, value: event.data.value });
    }
  }
}
```

- [ ] **Step 2: Spec, registration, commit (same pattern as T6)**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/donut-chart.component.spec.ts
git add frontend/src/app/shared/charts/donut-chart frontend/src/app/shared/shared.module.ts
git commit -m "feat(charts): add DonutChartComponent

Pie chart with 60-80% radius, total displayed in center via graphic.text.
Per-segment color override accepted via DonutDatum.color.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: HorizontalBarChartComponent

**Files:**
- Create: `frontend/src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component.{ts,html,spec.ts}`
- Modify: `frontend/src/app/shared/shared.module.ts`

- [ ] **Step 1: Component**

```ts
export interface BarDatum { label: string; value: number; }

@Component({ selector: 'app-horizontal-bar-chart', templateUrl: './horizontal-bar-chart.component.html' })
export class HorizontalBarChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() data: BarDatum[] = [];
  @Input() loading = false;
  @Input() height = 380;
  /**
   * Emits the bar's category label and value on click — `OverviewTabComponent`
   * wires this to `filters.toggleAirline(category)` for the OQ-P1-2 drill-down.
   */
  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;
  /** Cached top-N slice so the click handler can map an index back to its label. */
  private topRows: BarDatum[] = [];

  ngOnChanges(): void {
    this.topRows = this.data.slice(0, 10);
    this.options = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }},
      grid:    { left: 100, right: 30, top: 20, bottom: 30 },
      xAxis:   { type: 'value' },
      yAxis:   { type: 'category', data: this.topRows.map(d => d.label), inverse: true, axisLabel: { fontSize: 11 }},
      series: [{
        type: 'bar',
        data: this.topRows.map(d => d.value),
        barMaxWidth: 24,
        barCategoryGap: '20%',           // wider row hit area — OQ-P1-2 tap-target ≥44 px
        itemStyle: { color: this.resolvePrimary() },
        emphasis: { focus: 'series' },   // visual feedback on hover/tap
      }],
    };
  }

  /** echarts click handler — wired via the BaseChartComponent pass-through. */
  onChartClick(event: any): void {
    if (!event) { return; }
    // event.name is the y-axis category label (the airline) on a horizontal bar.
    const category = (event.name as string) || (event.data && event.data.name);
    if (category) {
      const row = this.topRows.find(r => r.label === category);
      this.barClick.emit({ category, value: row ? row.value : (event.value as number) || 0 });
    }
  }

  private resolvePrimary(): string {
    if (typeof document === 'undefined') { return '#2563EB'; }
    const v = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
    return v || '#2563EB';
  }
}
```

- [ ] **Step 2: Spec, registration, commit (same pattern as T6/T7)**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/horizontal-bar-chart.component.spec.ts
git add frontend/src/app/shared/charts/horizontal-bar-chart frontend/src/app/shared/shared.module.ts
git commit -m "feat(charts): add HorizontalBarChartComponent (top airlines)

Reverse y-axis category for top-N display; defends-in-depth via
data.slice(0, 10) even though callers already pass limit=10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: OverviewTabComponent

**Files:**
- Create: `frontend/src/app/features/dashboard/tabs/overview/overview-tab.component.{ts,html,scss,spec.ts}`

- [ ] **Step 1: Component**

Per spec [§8 — OverviewTabComponent](../specs/2026-05-05-phase-1-overview-tab.md#overviewtabcomponent). The orchestrator: subscribe to `filters.queryParams$`, on each emission `forkJoin` the four data endpoints, push results to BehaviorSubjects, manage `loading$`.

The complete implementation is in spec §8 — copy verbatim, then add `.html` and `.scss`.

- [ ] **Step 2: Template**

```html
<div class="overview" *ngIf="(loading$ | async) !== null">
  <!-- Row 1: 5 KPI cards (OQ-P1-1 — added Avg svc / agent / day) -->
  <div class="p-grid kpi-row">
    <div class="p-col-12 p-md-6 p-lg-2 p-xl-2">
      <app-kpi-card
        label="Total PRM Services"
        icon="pi-chart-bar"
        [value]="formatCount(totalPrm$ | async)"
        [delta]="totalDelta$ | async"
        subtext="vs prev period"
        [loading]="loading$ | async"></app-kpi-card>
    </div>
    <div class="p-col-12 p-md-6 p-lg-2 p-xl-2">
      <app-kpi-card
        label="Active Agents"
        icon="pi-user"
        [value]="(totalAgents$ | async) || 0 | number"
        [subtext]="'Self · ' + (agentsSelf$ | async) + '   Outsourced · ' + (agentsOutsourced$ | async)"
        [loading]="loading$ | async"></app-kpi-card>
    </div>
    <div class="p-col-12 p-md-6 p-lg-3 p-xl-3">
      <app-kpi-card
        label="Avg svc / agent / day"
        icon="pi-users"
        [value]="(avgServicesPerAgentPerDay$ | async) | number:'1.1-1'"
        [delta]="avgServicesDelta$ | async"
        subtext="vs prev period"
        [loading]="loading$ | async"></app-kpi-card>
    </div>
    <div class="p-col-12 p-md-6 p-lg-2 p-xl-2">
      <app-kpi-card
        label="Avg Duration (min)"
        icon="pi-clock"
        [value]="(avgDuration$ | async) | number:'1.0-0'"
        [delta]="durationDelta$ | async"
        subtext="vs prev period"
        [loading]="loading$ | async"></app-kpi-card>
    </div>
    <div class="p-col-12 p-md-6 p-lg-3 p-xl-3">
      <app-kpi-card
        label="Fulfillment Rate"
        icon="pi-check-circle"
        [value]="((fulfillmentPct$ | async) | number:'1.1-1') + '%'"
        [loading]="loading$ | async"></app-kpi-card>
    </div>
  </div>

  <!-- Row 2: Daily trend (8) + Service-type donut (4) -->
  <div class="p-grid chart-row">
    <div class="p-col-12 p-lg-8">
      <app-line-chart
        title="Daily PRM Trend"
        subtitle="Count of unique services per day (with previous-period overlay)"
        [trend]="dailyTrend$ | async"
        [secondarySeries]="dailyTrendPrev$ | async"
        [loading]="loading$ | async"></app-line-chart>
    </div>
    <div class="p-col-12 p-lg-4">
      <app-donut-chart
        title="Service Type Breakdown"
        subtitle="Top 5 categories by volume — click a segment to filter"
        [data]="serviceTypes$ | async"
        [loading]="loading$ | async"
        (segmentClick)="onServiceSegmentClick($event)"></app-donut-chart>
    </div>
  </div>

  <!-- Row 3: Top airlines (full width) -->
  <div class="p-grid chart-row">
    <div class="p-col-12">
      <app-horizontal-bar-chart
        title="Top Airlines"
        [data]="topAirlines$ | async"
        [loading]="loading$ | async"
        (barClick)="onAirlineBarClick($event)"></app-horizontal-bar-chart>
    </div>
  </div>
</div>
```

`(totalAgents$ | async) || 0` instead of `?? 0` — TS 3.4.5 + Angular 8 template compiler. The `||` is safe here because `0` is not a valid "active agents" sentinel (an empty filter that legitimately returns 0 agents still renders as `0` from the `| number` pipe — the `|| 0` only fires when the async pipe yields `null` mid-emit).

**TS 3.4.5 caveat:** the template uses `??` in one place (`(totalAgents$ | async) ?? 0`). Angular's template compiler is permissive and accepts it (it's not Angular template syntax — it's a pipe-input default). However, Angular 8's template compiler may not. Test in T13; if it fails, replace with `(totalAgents$ | async) || 0`.

- [ ] **Step 3: Helper for compact-number formatting**

In the component, add:

```ts
formatCount(n: number | null): string {
  if (n === null || n === undefined) { return '—'; }
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000)     { return (n / 1_000).toFixed(1) + 'k'; }
  return n.toLocaleString();
}

// OQ-P1-2 drill-down handlers — bar/donut clicks toggle FilterStore;
// the resulting URL change re-fires forkJoin, all charts re-render filtered.
// Date click on the line chart has no clear semantic — no-op.
onPointClick(_date: string): void { /* no-op — date click has no drill-down semantic */ }

onSegmentClick(name: string): void {
  // donut emits the segment name (= service code)
  this.filters.toggleService(name);
}

onBarClick(payload: { category: string; value: number }): void {
  // horizontal-bar emits { category, value }; category is the airline code/name
  this.filters.toggleAirline(payload.category);
}
```

`toggleService` / `toggleAirline` are mutators on `FilterStore` (see Task 2). They flip a value in / out of the array, push the merged URL via `Router.navigate([], { queryParams, queryParamsHandling: 'merge' })`, and emit on `queryParams$` — so the `forkJoin` re-fires and every sibling chart re-renders against the narrowed filter.

- [ ] **Step 4: Spec**

```ts
describe('OverviewTabComponent', () => {
  it('renders without throwing on empty filters', () => { /* mount with stubbed FilterStore.queryParams$ as of({}) */ });
  it('formatCount handles null', () => { /* */ });
  it('formatCount handles >= 1M', () => { /* */ });
  it('formatCount handles >= 1k', () => { /* */ });
  it('formatCount handles < 1k', () => { /* */ });
});
```

- [ ] **Step 5: DashboardComponent (the shell with `<router-outlet>`)**

`dashboard.component.ts` is short — owns the URL ↔ FilterStore sync described in spec §7:

```ts
@Component({ selector: 'app-dashboard', templateUrl: './dashboard.component.html', styleUrls: ['./dashboard.component.scss'] })
export class DashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(public filters: FilterStore, private route: ActivatedRoute, private router: Router, private authStore: AuthStore) {}

  ngOnInit(): void {
    this.route.queryParams.pipe(take(1), takeUntil(this.destroy$)).subscribe(params => {
      if (Object.keys(params).length === 0) {
        // Default airport set: first JWT airport (never-empty rule)
        const codes = this.authStore.airportCodesSnapshot;
        if (codes.length > 0) { this.filters.setAirport([codes[0]]); }
        this.filters.applyDefault();   // mtd date range
      } else {
        // Cast Params (Angular has loose Params type) → string-record before hydrate
        const dict: { [key: string]: string } = {};
        for (const k of Object.keys(params)) {
          const v = (params as any)[k];
          if (typeof v === 'string') { dict[k] = v; }
          else if (Array.isArray(v) && v.length > 0) { dict[k] = String(v[0]); }
        }
        this.filters.hydrateFromQueryParams(dict);
      }
    });

    this.filters.queryParams$.pipe(skip(1), debounceTime(150), takeUntil(this.destroy$)).subscribe(qp => {
      this.router.navigate([], { relativeTo: this.route, queryParams: qp, queryParamsHandling: '' });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

Template:

```html
<div class="dashboard-shell">
  <app-filter-bar></app-filter-bar>
  <main class="dashboard-content">
    <router-outlet></router-outlet>
  </main>
</div>
```

- [ ] **Step 6: Type-check + tests + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox --include=**/overview-tab.component.spec.ts
git add frontend/src/app/features/dashboard/tabs/overview frontend/src/app/features/dashboard/dashboard.component.ts frontend/src/app/features/dashboard/dashboard.component.html frontend/src/app/features/dashboard/dashboard.component.scss
git commit -m "feat(dashboard): OverviewTabComponent + DashboardComponent shell

OverviewTabComponent: forkJoin of 4 endpoints per filter change;
loading state propagates to all KPIs and charts. DashboardComponent:
URL ↔ FilterStore round-trip per spec §7 (skip(1) + debounceTime(150)).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: DashboardModule + NavigationStore

**Files:**
- Create: `frontend/src/app/features/dashboard/dashboard.module.ts`
- Create: `frontend/src/app/core/store/navigation.store.ts`
- Create: `frontend/src/app/core/store/navigation.store.spec.ts`

- [ ] **Step 1: NavigationStore**

A tiny BehaviorSubject store for the active tab title (used by the top-bar breadcrumb):

```ts
@Injectable({ providedIn: 'root' })
export class NavigationStore {
  private _activeTitle$ = new BehaviorSubject<string>('');
  activeTitle$ = this._activeTitle$.asObservable();
  get activeTitleSnapshot(): string { return this._activeTitle$.value; }
  setActiveTitle(title: string): void { this._activeTitle$.next(title); }
}
```

Spec: 3 tests (initial state empty, setActiveTitle updates, observable emits in order).

- [ ] **Step 2: DashboardModule**

```ts
@NgModule({
  imports: [
    SharedModule,
    DashboardRoutingModule,    // T11
    OverlayPanelModule,        // for date-range picker
  ],
  declarations: [
    DashboardComponent,
    FilterBarComponent,
    AirportSelectorComponent,
    DateRangePickerComponent,
    KpiCardComponent,
    OverviewTabComponent,
  ],
  providers: [
    PrmDataService,            // module-scoped, lives in lazy injector
  ],
})
export class DashboardModule {}
```

- [ ] **Step 3: Type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
git add frontend/src/app/features/dashboard/dashboard.module.ts frontend/src/app/core/store/navigation.store.ts frontend/src/app/core/store/navigation.store.spec.ts
git commit -m "feat(dashboard): DashboardModule + NavigationStore

DashboardModule provides PrmDataService (lazy-injector scope, not root).
NavigationStore drives the top-bar breadcrumb title (subscribed in
the AppComponent in a future commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Routing — register `/dashboard` lazy + child routes

**Files:**
- Create: `frontend/src/app/features/dashboard/dashboard-routing.module.ts`
- Modify: `frontend/src/app/app-routing.module.ts`

- [ ] **Step 1: Dashboard routing**

```ts
const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: OverviewTabComponent, data: { title: 'Overview' }},
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
```

- [ ] **Step 2: Add the dashboard route to AppRoutingModule**

In `app-routing.module.ts`, add to `baseRoutes` (before the `**` fallback):

```ts
{
  path: 'dashboard',
  canActivate: [AuthGuard],
  loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule),
  resolve: { tenant: TenantResolver },
},
```

The `TenantResolver` runs before the lazy module loads — guarantees `TenantStore` is populated by the time `<app-dashboard>` mounts (mitigates spec R-P1-1 race).

- [ ] **Step 3: Type-check + commit**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
git add frontend/src/app/features/dashboard/dashboard-routing.module.ts frontend/src/app/app-routing.module.ts
git commit -m "feat(routing): wire /dashboard lazy route + /dashboard/overview default child

TenantResolver attached so TenantStore is populated before the lazy
module instantiates and chart wrappers resolve --app-primary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Update home tile to navigate to `/dashboard`

**Files:**
- Modify: `frontend/src/app/features/home/home.component.ts` (verify only)
- Modify: `frontend/src/app/features/home/home.component.html` (verify only)

- [ ] **Step 1: Verify the tile already routes to `/dashboard`**

`home.component.ts` should already declare a tile with `route: '/dashboard'` and a click handler that calls `this.router.navigate([tile.route])`. Phase 0 wired this up; no functional change required.

- [ ] **Step 2: Optional UX polish — remove the "not yet ported" placeholder copy**

If `home.component.html` contains a "Phase 1 not yet shipped" hint paragraph, delete it. The tile's `description` ("Overview, top airlines, fulfillment metrics") and `meta` ("5 tabs · live data") still fit — don't change them.

- [ ] **Step 3: Commit (if anything changed)**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
git diff frontend/src/app/features/home  # should be empty or copy-only
git add frontend/src/app/features/home
git commit --allow-empty -m "chore(home): tile now navigates to live /dashboard/overview

Phase 0 wired the tile route to /dashboard; this commit is documentation
of the cutover. No code change unless a 'not yet ported' placeholder
copy was lingering in the template.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Don't commit empty unless you genuinely had nothing to change. The default expectation is: nothing changed.)

---

## Task 13: Acceptance — full browser smoke against the real Docker stack

**Files:** N/A — verification only

This is the most important task. The Phase 0 pass caught five integration bugs that unit tests didn't see; only a real browser visit revealed them. **Don't skip this.**

- [ ] **Step 1: Lint passes**

```powershell
docker compose run --rm frontend-dev npm run lint
```

Expected: zero errors. Warnings OK.

- [ ] **Step 2: Type-check is clean**

```powershell
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
```

Expected: zero errors.

- [ ] **Step 3: All tests pass**

```powershell
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
```

Expected: ≥ 30 tests pass (Phase 0 baseline ~21 + Phase 1 ~9). No failures.

- [ ] **Step 4: Production build clean**

```powershell
docker compose run --rm frontend-dev npx ng build --configuration=production
```

Expected: success. Initial bundle within 5 MB error budget (~2.4 MB expected — three new chart wrappers add ~50–80 KB; FilterStore + DashboardModule another ~30 KB).

- [ ] **Step 5: Bring up the full Docker stack**

```powershell
docker compose up -d --build
docker compose ps
```

Expected: `auth`, `tenant`, `prm`, `gateway`, `frontend` all `(healthy)` within ~60 s. If `frontend` healthcheck fails, check `docker compose logs frontend` — most often it's a runtime JS error in `main.ts` that AOT compilation didn't catch.

- [ ] **Step 6: Browser smoke — login + navigation**

Open `http://aeroground.localhost:4200`:

- [ ] Login page renders (parallax dark panel, Phase 0 styling intact)
- [ ] Sign in with a known seed credential (per `data/master/employees.csv`)
- [ ] Lands on `/home` showing the PRM Dashboard tile
- [ ] Click the tile → URL changes to `/dashboard` then redirects to `/dashboard/overview`

- [ ] **Step 7: Browser smoke — filter bar**

- [ ] Airport selector shows the user's JWT airports (open the Network tab, find the `/auth/me` response, compare `employee.airports` to the dropdown options)
- [ ] Default airport pre-selected (the first JWT airport)
- [ ] Multi-select works — pick a second airport, observe the URL `?airport=DEL,BOM`
- [ ] **Never-empty rule:** try to deselect both airports. Observe that the second-to-last deselect works but the last one is rejected (the chip stays)
- [ ] Airline / service / handled-by multi-selects populate (Network: a single `/prm/filters/options?airport=DEL,BOM` fires on mount and again when airport set changes)
- [ ] Date-range picker shows "Month to Date" + the resolved range (e.g. `Apr 1 – Apr 30`) in mono font on the trigger button
- [ ] Click the trigger → overlay panel opens with presets + calendar
- [ ] Click a preset → URL updates with new `date_from` / `date_to`, panel closes
- [ ] Pick a custom range on the calendar → URL updates, `datePreset` becomes `custom`

- [ ] **Step 8: Browser smoke — KPI cards**

- [ ] All 5 KPI cards render numeric values (not `—` or empty)
- [ ] Loading skeletons appear during a filter change and resolve within ~500 ms
- [ ] Total PRM Services delta arrow direction matches the math (set the date to "Last Month" and watch which way the delta points)
- [ ] Active Agents subtext shows `Self · N   Outsourced · M`
- [ ] Avg Duration value is a sensible integer (10–60 range typically)
- [ ] Fulfillment Rate value is `XX.X%` (with the percent sign)

- [ ] **Step 9: Browser smoke — charts**

- [ ] Daily PRM Trend line chart renders with one series; smooth line; gradient area fill below; dashed average line
- [ ] **PoP overlay (OQ-P1-3):** a fainter dotted line in the same primary hue at ~0.35 opacity sits beneath the current series; legend shows "Prev period" with reduced opacity. Set the date range to "Last 7 Days" — overlay appears. Set the range to "All time" or a span longer than the data — overlay vanishes (no prev period available)
- [ ] Service Type Breakdown donut renders 5 segments; "TOTAL" label centered
- [ ] Top Airlines horizontal bar chart renders bars sorted descending (largest at the top)
- [ ] All chart accents use the tenant's `primaryColor` — log in as a different tenant subdomain (e.g. `gateway.localhost`) and observe the colors change
- [ ] Hover over a chart → tooltip shows in mono font
- [ ] Browser console has zero errors (some PrimeNG 8 deprecation warnings from upstream are tolerable; document if they appear)

- [ ] **Step 9b: Browser smoke — drill-down (OQ-P1-2)**

- [ ] Click a bar in **Top Airlines** → `?airline=<code>` appears in the URL; that bar gets a "selected" treatment (slightly thicker stroke or higher opacity)
- [ ] Donut **Service Type** segments narrow accordingly (only that airline's services); KPI numbers shrink; trend line dips
- [ ] Click the same bar again → airline removed from `?airline`; original full-tenant view restores
- [ ] Click a **donut segment** → `?service=<code>` appears in the URL; bar chart re-renders with airlines filtered to that service
- [ ] Click a **line-chart point** → nothing happens (date click has no drill-down semantic by spec §13 OQ-P1-2)
- [ ] Tap target ≥ 44 px verified: hit even the thinnest bar / thinnest donut segment from a touch device emulator without missing

- [ ] **Step 10: URL sync + reload**

- [ ] Set filters, copy URL
- [ ] Open a new tab, paste, log in (if needed) → identical filter state restores
- [ ] F5 reload — filter state preserved exactly
- [ ] Click the back button after a filter change — previous filter state restores (router history works)

- [ ] **Step 11: Theme toggle**

- [ ] Click the theme toggle in the top bar
- [ ] Light → dark — chart colors re-resolve from CSS vars (no caching of stale palettes)
- [ ] All KPI cards / chart cards render readably in dark mode

- [ ] **Step 12: Empty state**

- [ ] Set a date range with no PRM services (e.g. far in the future or far in the past where seed data is empty)
- [ ] All charts show "No data matches current filters"
- [ ] KPI cards show `0` / `—` (not crash)
- [ ] No console errors

- [ ] **Step 13: RBAC enforcement**

- [ ] Manually edit the URL to add `?airport=ZZZ` (a code definitely not in the JWT)
- [ ] Backend should respond 403 (check Network tab)
- [ ] Frontend handles gracefully — no white-screen-of-death; loading state ends; existing data may stay visible (acceptable for Phase 1)

- [ ] **Step 14: Phase 0 regression**

- [ ] `/login` page still works (parallax)
- [ ] `/_smoke` still works (PrimeNG smoke page)
- [ ] `/__bogus__` still shows the 404 ("Flight diverted") page

- [ ] **Step 15: Cleanup, final commit (no-op if nothing changed), tag**

```powershell
git status
```
Expected: clean working tree.

If any last-minute fixes were needed, commit them with a descriptive message ending in the Co-Authored-By trailer.

```powershell
git tag -a v0.1.0-phase1 -m "Phase 1 (Overview tab) complete — first dashboard tab live against real backend"
git log --oneline -20
```

Expected: tag points at the head of `angular-8-rewrite`.

---

## Common pitfalls (from Phase 0 + spec §13)

A non-exhaustive list. Re-read before you call something "complete":

1. **DTO field name drift.** Phase 0 caught five. Always read the C# record first.
2. **`.p-*` instead of `.ui-*` selectors** in custom CSS. PrimeNG 8.0.3 uses `.ui-*`.
3. **`?.` and `??` syntax** in TS files. Use `obj && obj.prop` and `value || fallback`.
4. **Bare `tsc --noEmit`** instead of `npx tsc --noEmit -p tsconfig.app.json`. Bare walks `@types/undici-types` which has TS 4.x syntax.
5. **`ng serve` on the host.** Host has Node 22; the dev container has Node 12.
6. **`queryParamsHandling: 'merge'`** when clearing filters. Use `''` (replace) so empty filters drop their URL params.
7. **Missing `skip(1)` on the `queryParams$` push subscription.** Without it, `combineLatest` synchronously emits on subscription and overwrites the URL params we just hydrated from.
8. **Multi-select `[appendTo]="'body'"` not set.** Without it, the panel can clip inside the filter bar's overflow.
9. **Chart color resolved before `--app-primary` is set.** Verify the chart re-paints in the right color after a tenant switch; if not, the resolver fires too early — push the tenant write into `APP_INITIALIZER`.
10. **Backend route plurals.** It's `/tenants/config` not `/tenant/config`; `/auth/login` not `/login`. ApiClient prepends `/api`. Don't double up.
11. **Login DTO is `{ username, password }` not `{ email, password }`.** See `phase0_dto_alignment_lessons.md`.
12. **Empty airport array → 400 from backend.** Always have at least one airport (the never-empty rule).

---

## Out of scope for this plan (subsequent phases)

| Phase | Deliverables |
|---|---|
| **Phase 2** (Top10 tab) | `Top10TabComponent`, `Top10Module`, `AgentRankingsResponse` DTO + `topAgents()` data-service method, `FlightRankingsResponse` DTO + `topFlights()`. Reuses `HorizontalBarChartComponent` |
| **Phase 3** (Service Breakup tab) | `SankeyChartComponent` + module + tab — flatter v4 sankey gradients accepted |
| **Phase 4** (Fulfillment tab) | `HeatmapChartComponent` (7×24 grid) + module + tab |
| **Phase 5** (Insights tab) | `InsightsTabComponent` — agent-service matrix |
| **Phase 6** (Polish) | `SavedViewsStore` + saved-views menu, command palette (Ctrl/Cmd-K), toast container, sparklines in KPI cards, period-over-period overlays, chart-click drill-downs |
| **Phase 7** (Cutover) | Side-by-side comparison vs `main`, delta documentation, merge decision |

After Phase 1 is verified end-to-end, request the Phase 2 plan with: *"Write the Phase 2 spec and plan."*
