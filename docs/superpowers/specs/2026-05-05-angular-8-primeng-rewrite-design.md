# Frontend Rewrite — Angular 17 → Angular 8 + PrimeNG

| | |
|---|---|
| **Date** | 2026-05-05 |
| **Author** | Prerak Gupta |
| **Status** | Draft — pending user approval |
| **Branch (target)** | `angular-8-rewrite` |
| **Backend impact** | None — backend, auth, tenancy, data layer unchanged |
| **Estimated effort** | 58–80 hours |

---

## 1. Executive summary

The PRM Dashboard frontend will be rewritten from **Angular 17** (standalone components, NgRx Signal Store, Angular Material 3, ECharts 5 via ngx-echarts 17) to **Angular 8** (NgModules, BehaviorSubject services, **PrimeNG 8 themed to look like Material**, ECharts 4 via ngx-echarts 5).

This is a **same-codebase integration** requirement: the PRM Dashboard must live inside an existing Angular 8 host application, sharing its build and bundle. Web Components, iframes, and module federation were considered and rejected per the host team's constraint.

The .NET 8 backend, the DuckDB-over-Parquet data layer, the JWT auth flow, and the subdomain-based multi-tenancy contract are **all untouched**. Scope is **frontend-only**.

The work is sequenced as a hybrid B+C plan: a foundation phase that produces a runnable app early (Phase 0), followed by vertical-slice porting of one dashboard tab at a time (Phases 1–5), then polish (Phase 6) and a cutover decision checkpoint (Phase 7).

---

## 2. Goals

- Deliver a functionally complete Angular 8 frontend that matches today's feature set (5-tab dashboard, 6 chart types, login flow, saved views, command palette, dark/light theme, 404 page, multi-tenant routing, RBAC airport filtering)
- Preserve the visual identity (gradient KPI cards, parallax login panel, Material color palette, Material floating-label form fields, Roboto typography) using PrimeNG components themed to look Material
- Keep the rewrite isolated on a branch (`angular-8-rewrite`) until cutover decision
- Use only libraries and APIs available in the Angular 8 ecosystem (mid-2019 era)
- Maintain test coverage (Karma + Jasmine) and add a smoke test per dashboard tab

## 3. Non-goals

- Backend changes (zero work in `backend/`, `data/`, `tools/`)
- E2E test framework (none today, none added)
- CI / GitHub Actions (out of scope for this rewrite)
- Visual perfection — PrimeNG component primitives (button shape, dropdown chevrons, dialog corners) will retain PrimeNG identity even with Material theming
- Replacing the JWT/refresh-token auth mechanism
- Replacing the subdomain → `X-Tenant-Slug` tenant resolution
- Migrating the host Angular 8 app to a newer version

---

## 4. Decisions log

Captured from the brainstorming dialogue (Q1–Q7).

| # | Question | Answer | Rationale |
|---|---|---|---|
| Q1 | Why Angular 8? | Integration requirement — host app is Angular 8 | Hard external constraint |
| Q2 | Integration mechanism? | Same codebase / same build (full rewrite) | Host team's mandate; rules out Angular Elements / iframes |
| Q3 | What's known about host app? | Only "Angular 8 + PrimeNG" — no other detail | Plan with sensible defaults; flag open questions |
| Q4 | State management? | BehaviorSubject services (no NgRx) | Smallest, simplest path; easy to swap if host requires NgRx later |
| Q5a | .NET backend changes? | None — stays exactly as-is | Scope discipline; backend already works |
| Q5b | Auth flow changes? | None — PRM owns its login | Strip later only if host has SSO |
| Q5c | Tenant resolution changes? | None — subdomain-based stays | Backend is the source of truth |
| Q6 | Code location? | New branch `angular-8-rewrite`; main untouched | Cheap rollback; A/B comparison during port |
| Q7 | Visual fidelity? | Material-themed PrimeNG (preserve gradient KPIs, parallax login, Material color palette, floating-label form fields, Roboto) | Hybrid drifted toward "match exactly"; user prioritized form-field look + Material colors |

---

## 5. Locked tech stack

### Runtime / framework

| Layer | Version |
|---|---|
| Angular | 8.3.x (latest 8.x minor — 8.3.29) |
| TypeScript | 3.5.3 |
| RxJS | 6.5.5 |
| zone.js | 0.9.1 |
| Node.js (build) | 12.22.x — pinned via `.nvmrc` |
| Build tool | Angular CLI 8 (webpack 4 under the hood) |

### UI / components

| Layer | Version |
|---|---|
| PrimeNG | 8.1.4 (last 8.x release) |
| PrimeIcons | 2.0.0 |
| PrimeFlex | 1.3.1 |

### Charts

| Layer | Version |
|---|---|
| echarts | 4.9.0 |
| ngx-echarts | 5.2.2 |

### Tooling

| Layer | Version |
|---|---|
| Linting | TSLint 5.15.0 + codelyzer 5.1.2 |
| Tests | Karma 4.1 + Jasmine 3.4 |
| Type-check | `tsc --noEmit` via `ng build` |

### Pinned dependencies — full `package.json`

```json
{
  "dependencies": {
    "@angular/animations": "8.2.14",
    "@angular/cdk": "8.2.3",
    "@angular/common": "8.2.14",
    "@angular/compiler": "8.2.14",
    "@angular/core": "8.2.14",
    "@angular/forms": "8.2.14",
    "@angular/platform-browser": "8.2.14",
    "@angular/platform-browser-dynamic": "8.2.14",
    "@angular/router": "8.2.14",
    "primeng": "8.1.4",
    "primeicons": "2.0.0",
    "primeflex": "1.3.1",
    "echarts": "4.9.0",
    "ngx-echarts": "5.2.2",
    "rxjs": "6.5.5",
    "tslib": "1.10.0",
    "zone.js": "0.9.1"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "0.803.29",
    "@angular/cli": "8.3.29",
    "@angular/compiler-cli": "8.2.14",
    "@angular/language-service": "8.2.14",
    "@types/jasmine": "3.3.16",
    "@types/jasminewd2": "2.0.6",
    "codelyzer": "5.1.2",
    "jasmine-core": "3.4.0",
    "jasmine-spec-reporter": "4.2.1",
    "karma": "4.1.0",
    "karma-chrome-launcher": "2.2.0",
    "karma-coverage-istanbul-reporter": "2.0.6",
    "karma-jasmine": "2.0.1",
    "karma-jasmine-html-reporter": "1.4.0",
    "tslint": "5.15.0",
    "typescript": "3.5.3"
  }
}
```

---

## 6. Project structure

The same logical layout as today, restructured into Angular 8 NgModules.

```text
frontend/                                   # Replaced on the branch (preserved on main)
├── package.json
├── angular.json                            # Angular CLI 8 schema
├── tsconfig.json                           # target: es2015, strict: true
├── tslint.json
├── .nvmrc                                  # 12.22.12
├── Dockerfile                              # node:12-alpine builder + nginx:alpine runtime
├── nginx.conf
├── proxy.conf.json                         # /api → localhost:5000 (local dev)
├── proxy.conf.docker.json                  # /api → gateway:5000 (in-container dev)
└── src/
    ├── main.ts
    ├── index.html                          # <link id="app-theme"> for runtime theme swap
    ├── styles.scss                         # Imports + custom overrides
    ├── styles/
    │   ├── _variables.scss                 # Material 3 tokens, gradient stops, breakpoints
    │   ├── _kpi-gradients.scss             # Preserved gradient KPI card mixin
    │   ├── _login-parallax.scss            # Preserved parallax login styles
    │   ├── _form-field.scss                # Floating-label + underline indicator styles
    │   ├── _material-tokens.scss           # M3 → PrimeNG CSS variable mapping
    │   └── primeng-overrides.scss          # Targeted PrimeNG component overrides
    ├── environments/
    │   ├── environment.ts
    │   ├── environment.prod.ts
    │   └── environment.staging.ts
    ├── assets/
    │   └── themes/
    │       ├── saga-blue/theme.css         # PrimeNG light theme (base)
    │       └── vela-blue/theme.css         # PrimeNG dark theme (base)
    └── app/
        ├── app.module.ts                   # Root NgModule
        ├── app-routing.module.ts           # Lazy routes via loadChildren
        ├── app.component.{ts,html,scss}    # Root shell
        │
        ├── core/                           # Singletons — provided in CoreModule
        │   ├── core.module.ts              # imported once in AppModule
        │   ├── auth/
        │   │   ├── auth.service.ts
        │   │   ├── auth.guard.ts
        │   │   ├── auth.interceptor.ts     # Class-based HttpInterceptor
        │   │   └── tenant.resolver.ts
        │   ├── api/
        │   │   └── api.client.ts
        │   ├── progress/
        │   │   └── progress.service.ts
        │   ├── store/
        │   │   ├── auth.store.ts           # BehaviorSubject-based
        │   │   ├── tenant.store.ts
        │   │   ├── filter.store.ts
        │   │   ├── navigation.store.ts
        │   │   └── saved-views.store.ts
        │   ├── toast/
        │   │   └── toast.service.ts        # Wraps PrimeNG MessageService
        │   └── theme/
        │       └── theme.service.ts        # Swaps stylesheet href at runtime
        │
        ├── features/                       # Each = its own lazy NgModule
        │   ├── auth/
        │   │   ├── auth.module.ts
        │   │   ├── auth-routing.module.ts
        │   │   └── login/
        │   │       └── login.component.{ts,html,scss}
        │   ├── home/
        │   │   ├── home.module.ts
        │   │   ├── home-routing.module.ts
        │   │   └── home.component.{ts,html,scss}
        │   ├── not-found/
        │   │   ├── not-found.module.ts
        │   │   ├── not-found-routing.module.ts
        │   │   └── not-found.component.{ts,html,scss}
        │   └── dashboard/
        │       ├── dashboard.module.ts
        │       ├── dashboard-routing.module.ts
        │       ├── dashboard.component.{ts,html,scss}
        │       ├── components/
        │       │   ├── filter-bar/
        │       │   ├── date-range-picker/
        │       │   └── kpi-card/
        │       ├── services/
        │       │   └── prm-data.service.ts
        │       ├── utils/
        │       │   ├── date-presets.ts
        │       │   └── annotations.ts
        │       └── tabs/
        │           ├── overview/
        │           ├── top10/
        │           ├── service-breakup/
        │           ├── fulfillment/
        │           └── insights/
        │
        └── shared/
            ├── shared.module.ts            # Re-exports common PrimeNG modules
            ├── charts/
            │   ├── base-chart.component.ts
            │   ├── bar-chart/
            │   ├── donut-chart/
            │   ├── line-chart/
            │   ├── horizontal-bar-chart/
            │   ├── sankey-chart/
            │   └── heatmap-chart/
            ├── components/
            │   ├── top-bar/
            │   ├── airport-selector/
            │   ├── progress-bar/
            │   ├── saved-views-menu/
            │   ├── command-palette/
            │   ├── toast-container/
            │   ├── dev-tenant-picker/
            │   └── form-field/             # Custom Material-style float-label wrapper
            └── pipes/
                └── compact-number.pipe.ts
```

### Key structural changes vs current Angular 17

- **Standalone components → NgModules.** Every feature gets its own `*.module.ts`. The `core / shared / feature` module pattern is the Angular 8 standard.
- **`loadComponent` → `loadChildren`.** Lazy routes import the feature module, which declares its component.
- **`inject()` function → constructor injection.** No exceptions.
- **`@if` / `@for` → `*ngIf` / `*ngFor`.** Mechanical conversion across every template.
- **Custom `[appTooltip]` directive deleted** — replaced by PrimeNG's `pTooltip`.
- **New `<app-form-field>` component** — wraps any PrimeNG input with Material-style floating label + animated underline indicator.
- **TS `strict: true`** stays on. The downgrade does not loosen type safety.

---

## 7. State management strategy

### Pattern: BehaviorSubject services

All five stores (`auth`, `tenant`, `filter`, `navigation`, `saved-views`) follow this shape:

```ts
@Injectable({ providedIn: 'root' })
export class FilterStore {
  // Internal — private BehaviorSubjects only
  private _airport$ = new BehaviorSubject<string[]>([]);
  private _airline$ = new BehaviorSubject<string[]>([]);

  // Public observable API
  airport$ = this._airport$.asObservable();
  airline$ = this._airline$.asObservable();

  // Synchronous snapshot accessors (for services / guards)
  get airportSnapshot() { return this._airport$.value; }
  get airlineSnapshot() { return this._airline$.value; }

  // Derived (computed equivalent)
  filtersAsQueryParams$ = combineLatest([
    this._airport$, this._airline$, /* … */
  ]).pipe(
    map(([airport, airline /*, …*/]) => ({ /* … */ })),
    shareReplay(1)
  );

  // Mutations — direct on the subjects
  setAirport(value: string | string[] | null): void { /* … */ }
  toggleAirport(code: string): void {
    const current = this._airport$.value;
    if (current.includes(code) && current.length === 1) return;  // never empty
    this._airport$.next(/* … */);
  }
}
```

### Translation table — Signal Store → BehaviorSubject

| Angular 17 (current) | Angular 8 (target) |
|---|---|
| `signalStore({ ... })` | `class XxxStore` (Injectable service) |
| `signal(value)` | `private _foo$ = new BehaviorSubject<T>(value)` |
| reading: `store.foo()` | template: `store.foo$ \| async` / code: `store.fooSnapshot` |
| `computed(() => …)` | `derived$ = combineLatest([…]).pipe(map(…), shareReplay(1))` |
| `effect(() => { … })` | `subscribe()` in `ngOnInit` + cleanup in `ngOnDestroy` via `takeUntil(destroy$)` |
| `patchState(store, { foo: x })` | `this._foo$.next(x)` |
| `inject(MyService)` | `constructor(private myService: MyService)` |
| `toObservable(signal)` | already an Observable |
| `takeUntilDestroyed()` | `takeUntil(this.destroy$)` + `destroy$ = new Subject<void>()` |

### Preserved invariants from current code

- "Never empty airport array" guard in `FilterStore.toggleAirport()` (per CLAUDE.md airport filter rules)
- Multi-select wire format (`airport: string[]` → `?airport=DEL,BOM`)
- Snapshot-vs-stream distinction (template uses async pipe; services use `xxxSnapshot` getters)
- All store contracts (field names, method names, JWT claim names, API URLs, DTOs) unchanged

### URL sync (FilterStore — the most complex case)

`effect()` is replaced with a manual subscription in `DashboardComponent.ngOnInit`:

```ts
ngOnInit() {
  // 1. Hydrate from URL on entry
  this.route.queryParams.pipe(
    take(1),
    takeUntil(this.destroy$)
  ).subscribe(params => this.filterStore.hydrateFromQueryParams(params));

  // 2. Push changes back to URL
  this.filterStore.filtersAsQueryParams$.pipe(
    skip(1),
    debounceTime(150),
    takeUntil(this.destroy$)
  ).subscribe(queryParams => {
    this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  });
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

### Auth flow — class-based interceptor

```ts
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private authStore: AuthStore) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.authStore.accessTokenSnapshot;
    const authedReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }})
      : req;

    return next.handle(authedReq).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status !== 401 || req.url.includes('/auth/refresh')) {
          return throwError(err);
        }
        return this.auth.refresh().pipe(
          switchMap(() => {
            const newToken = this.authStore.accessTokenSnapshot;
            return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` }}));
          }),
          catchError(refreshErr => {
            this.auth.logout();
            return throwError(refreshErr);
          })
        );
      })
    );
  }
}
```

Registered in `AppModule.providers`:

```ts
{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
```

---

## 8. UI component migration — Material → PrimeNG

### Component-by-component mapping

| Today (Angular Material 3) | Replacement (PrimeNG 8) | Notes |
|---|---|---|
| `mat-button` | `<button pButton>` + class modifiers | `p-button-raised`, `p-button-text` |
| `mat-icon-button` | `<button pButton icon="pi pi-foo">` | Icons via `primeicons` |
| `mat-icon` | `<i class="pi pi-foo">` | `primeicons` |
| `mat-card` | `p-card` | Different slot prop names |
| `mat-form-field` + `matInput` | `<app-form-field>` + `<input pInputText>` | Custom float-label wrapper |
| `mat-select` | `p-dropdown` | `[options]` takes `{label, value}[]` |
| `mat-select` (multi) | `p-multiSelect` | airline / service / handled_by filters |
| `mat-chip-list` / `mat-chip` | Custom span pills + icon button | PrimeNG `p-chip` is too minimal |
| `mat-checkbox` | `p-checkbox` with `[binary]="true"` | |
| `mat-radio-group` / `mat-radio-button` | `p-radioButton` | One per option, no group |
| `mat-slide-toggle` | `p-inputSwitch` | Theme toggle |
| `mat-tab-group` / `mat-tab` | `p-tabView` / `p-tabPanel` | Dashboard 5-tab layout |
| `mat-menu` | `p-menu` (popup) | TopBar dropdowns + saved-views menu |
| `mat-dialog` (`MatDialog.open`) | `p-dialog` (`[(visible)]="show"`) | **Inverted control — see callout 2 below** |
| `mat-snack-bar` | `p-toast` + `MessageService` | Wrapped in our `ToastService` |
| `mat-progress-bar` | `p-progressBar` | Global top progress bar |
| `mat-progress-spinner` | `p-progressSpinner` | Inside `BaseChartComponent` loading state |
| `mat-tooltip` / `[matTooltip]` | `[pTooltip]` | Drop our custom `[appTooltip]` directive |
| `mat-paginator` | `p-paginator` | If used (audit Phase 2) |
| `mat-table` | `p-table` | If used (audit Phase 2) |
| `mat-datepicker` | `p-calendar` (`selectionMode="range"`) | Inside custom DateRangePicker preset panel |
| `mat-autocomplete` | `p-autoComplete` | If used in airport selector |

### High-impact callouts

1. **DateRangePicker (16-preset component)** — keep the custom preset-panel UI verbatim (already custom in `dashboard/utils/date-presets.ts`). Swap only the inline calendar from `mat-datepicker` to `p-calendar`. Preset chips remain custom.

2. **Dialog inversion** — Material's `MatDialog.open(MyDialog)` opens imperatively from a service; PrimeNG `p-dialog` is template-driven (`<p-dialog [(visible)]="dialogOpen">`). Code that opens dialogs from a service will move into the calling component. Audit during Phase 6 — the current code uses very few dialogs.

3. **Theme toggle** — runtime swap of the `<link>` tag's href:

   ```ts
   setTheme(mode: 'light' | 'dark'): void {
     const link = document.getElementById('app-theme') as HTMLLinkElement;
     link.href = mode === 'dark'
       ? 'assets/themes/vela-blue/theme.css'
       : 'assets/themes/saga-blue/theme.css';
     this._mode$.next(mode);
     localStorage.setItem('app.theme', mode);
   }
   ```

4. **Custom `[appTooltip]` directive deleted** — no longer needed; `pTooltip` covers the use case cleanly. The `shared/directives/` folder is removed.

### Module imports

`SharedModule` re-exports the PrimeNG modules used in 2+ places:

```ts
@NgModule({
  exports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    ButtonModule, InputTextModule, DropdownModule, MultiSelectModule,
    CardModule, MenuModule, TooltipModule, CheckboxModule, ProgressBarModule,
    ToastModule, DialogModule, CalendarModule
  ]
})
export class SharedModule {}
```

Feature modules `import: [SharedModule]` and only declare their own components.

---

## 9. Charts — echarts 5 → 4 migration

### What changes

| Feature in current code | echarts 4 status | Action |
|---|---|---|
| Stacked area lines | Same API | No change |
| Dual y-axis on line chart | Same API | No change |
| Sankey with curved links | Supported | Slightly flatter gradients |
| Heatmap (calendar + 7×24 grid) | Supported | No change |
| `markLine` / `markArea` | Same API | `DEMO_ANNOTATIONS` unchanged |
| Tooltip HTML formatter | Same API | No change |
| `LinearGradient` | Same name, different module path | Use `echarts.graphic.LinearGradient` |
| Custom theme registration | Same API | No change |
| `dataset` source binding | Limited in v4 | We don't use it |
| Smooth animations | Slightly choppier | Acceptable |
| Bundle size | ~1MB (vs 750KB on v5) | Live with it |

### `BaseChartComponent` shape

```ts
@Component({ selector: 'app-base-chart', templateUrl: './base-chart.component.html' })
export class BaseChartComponent {
  @Input() title?: string;
  @Input() loading: boolean = false;
  @Input() options: EChartsOption | null = null;
  @Input() height: number = 320;

  get isEmpty(): boolean {
    if (!this.options) return true;
    const series = (this.options as any).series ?? [];
    return Array.isArray(series) && series.every((s: any) => !s.data?.length);
  }
}
```

Children (`BarChartComponent`, etc) take typed `@Input` props, build `EChartsOption` in `ngOnChanges`, pass it to `<app-base-chart [options]="echartsOptions">`.

---

## 10. Theming — Material-themed PrimeNG

The user's choice in Q7 (revised) means: **PrimeNG components, Material-3 visual identity**. This is a deliberate trade-off — PrimeNG primitives keep their shape, but colors / typography / form-field interaction read as Material.

### Preserved (custom SCSS)

- **Gradient KPI cards** — purple/teal/orange/red gradients applied to `<p-card>` host class via SCSS mixin (`_kpi-gradients.scss`)
- **Parallax login panel** — split-screen mouse-tracking parallax on the dark side (`_login-parallax.scss`)
- **Soft elevation shadows** — `--app-elev-1`, `--app-elev-2` shadow tokens (replacing Material's `mat-elevation-z*`)
- **CSS custom properties for tenant primary color** — `--tenant-primary` set at app root from `TenantStore`
- **Material 3 color palette** — M3 tokens (primary, on-primary, surface, surface-variant, on-surface, error, etc) mapped to PrimeNG CSS variables for both light + dark modes (`_material-tokens.scss`)
- **Roboto typography** — overrides PrimeNG's default Source Sans Pro
- **Floating-label form fields with underline indicator** — custom `<app-form-field>` component (~6–8 hours to build, applied across the app)

### Material 3 token mapping (excerpt)

```scss
:root {
  --md-primary: #6750a4;
  --md-on-primary: #ffffff;
  --md-surface: #fffbfe;
  --md-on-surface: #1c1b1f;
  --md-surface-variant: #e7e0ec;
  --md-on-surface-variant: #49454f;
  --md-error: #b3261e;
  --md-on-error: #ffffff;

  /* Override PrimeNG variables */
  --primary-color: var(--md-primary);
  --primary-color-text: var(--md-on-primary);
  --surface-card: var(--md-surface);
  --text-color: var(--md-on-surface);
  --text-color-secondary: var(--md-on-surface-variant);
}

[data-theme="dark"] {
  --md-primary: #d0bcff;
  --md-on-primary: #381e72;
  --md-surface: #1c1b1f;
  --md-on-surface: #e6e1e5;
  /* … */
}
```

### `<app-form-field>` (the custom directive)

Wraps any PrimeNG control with Material-style floating label + animated underline. Tracks focus / blur / value-presence via `@ContentChild` reference to the inner control.

```html
<!-- Usage -->
<app-form-field label="Airline" [hint]="'Multi-select'" [error]="form.get('airline')?.errors">
  <p-multiSelect formControlName="airline" [options]="airlineOptions"></p-multiSelect>
</app-form-field>
```

Internally:
- Label animates from inside → above on focus or when value present
- Underline `<div>` shifts color (idle → focus → error)
- Reads `@ContentChild(NgControl)` to track focus state
- Subscribes to `valueChanges` to track presence

### Visual delta after port

| Element | After port | Severity |
|---|---|---|
| Buttons | PrimeNG with Material colors + Roboto | Subtle (close enough) |
| Form fields | Floating label + underline (preserved) | None |
| Charts | Identical | None |
| KPI cards | Gradient (preserved) | None |
| Login | Parallax dark panel (preserved) | None |
| Color palette | Material 3 tokens (preserved) | None |
| Typography | Roboto (preserved) | None |
| Tabs | PrimeNG with Material underline color | Subtle |
| Dropdowns / dialogs / toast | PrimeNG with Material colors | Subtle |

---

## 11. Build, deployment & testing

### Node version constraint

Angular 8 will not build on Node 18+. Two paths, both used:

- **Build inside Docker** — multi-stage Dockerfile with `node:12.22-alpine` builder stage
- **Local dev via `nvm`** — `.nvmrc` pinned to `12.22.12`

### Frontend Dockerfile (replaces current Node 18 image)

```dockerfile
FROM node:12.22-alpine@sha256:<digest> AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine@sha256:<digest> AS runtime
COPY --from=build /app/dist/frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --spider http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

Both base images pinned to sha256 digests (consistent with `2026-04-23` decision).

### nginx.conf

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / { try_files $uri $uri/ /index.html; }

  location ~* \.(js|css|woff2|woff|ttf|svg|png|jpg|jpeg|gif|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate";
  }

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
}
```

### `docker-compose.yml` — only the `frontend` service changes

Backend services unchanged. Frontend block:

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
  ports:
    - "4200:80"
  depends_on:
    gateway:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget --quiet --spider http://localhost/ || exit 1"]
    interval: 30s
    timeout: 3s
    retries: 3
    start_period: 10s
```

### Build configurations (`angular.json`)

| Configuration | Optimization | Source maps | API URL |
|---|---|---|---|
| `development` (default `ng serve`) | off | yes | proxied via `proxy.conf.json` |
| `production` (Docker build) | full + AOT + buildOptimizer | no | `/api` (relative — nginx proxies in production) |
| `staging` (optional) | full | yes | staging API URL |

### Bundle budget

```json
"budgets": [
  { "type": "initial", "maximumWarning": "2mb", "maximumError": "5mb" },
  { "type": "anyComponentStyle", "maximumWarning": "6kb", "maximumError": "10kb" }
]
```

Expected initial bundle: ~2.2MB (vs ~1.4MB today on v17). Within budget.

### Testing strategy

| Layer | Tool | Status |
|---|---|---|
| Unit + component | Karma + Jasmine | Same as today |
| Lint | TSLint + codelyzer | Replaces ESLint |
| Type-check | `tsc --noEmit` | Via `ng build` |
| E2E | None | Same as today |

**Eight tests total when done:** 1 sanity test (`AppComponent.spec.ts` ported) + 1 smoke test per dashboard tab (mounts component with stubbed services, asserts no errors thrown). Smoke tests use `TestBed.configureTestingModule({ declarations, imports, providers })` with stubbed `PrmDataService`, `AuthStore`, `FilterStore`, etc.

### Backend impact

Zero. CORS, refresh-cookie scope, subdomain header — all unchanged. Parquet files, CSVs, tenant onboarding flow — unchanged.

---

## 12. Phased migration plan

### Phase 0 — Foundation (≈ 20–28 hrs, theme work front-loaded)

End state: runnable app with login + home (placeholder) + theme toggle + one chart wrapper proof.

- New branch `angular-8-rewrite` (delete old `frontend/` content on the branch only)
- Scaffold Angular 8.3.x project under `frontend/`
- `package.json` with locked versions (Section 5)
- `.nvmrc` → `12.22.12`
- `Dockerfile` (Node 12 builder + nginx runtime, sha256-pinned)
- Update `docker-compose.yml` frontend service block
- TSLint + codelyzer config
- `tsconfig.json` with `strict: true`
- PrimeNG theme baseline (`saga-blue` + `vela-blue` stylesheets)
- Material 3 token mapping in `_material-tokens.scss`
- Gradient KPI mixin in `_kpi-gradients.scss`
- Parallax login styles in `_login-parallax.scss`
- Roboto typography integration
- `ThemeService` (runtime stylesheet swap)
- `AuthStore`, `TenantStore` (BehaviorSubject)
- `AuthService`, `ApiClient`, `AuthInterceptor`, `AuthGuard`, `TenantResolver`
- `app.module.ts`, `app-routing.module.ts`, `core.module.ts`, `shared.module.ts`
- Login page ported (split layout + parallax)
- Home page ported (tile picker — clicks lead to "tab not yet ported")
- `BaseChartComponent` + `BarChartComponent` (proof of ngx-echarts 5 + echarts 4)
- `<app-form-field>` custom directive built + applied to login form
- Karma + Jasmine wired; `AppComponent.spec.ts` ported
- PrimeNG smoke screen page (visual sanity check of every component to be used)

### Phase 1 — Overview tab (≈ 12–15 hrs)

End state: first fully working dashboard tab. Forces shared infrastructure to be right.

- `FilterStore` (BehaviorSubject) with URL-sync logic
- `NavigationStore` (BehaviorSubject)
- `DateRangePicker` component with 16 presets (custom panel + `p-calendar`)
- `FilterBar` (airline / service / handled_by multi-selects via `p-multiSelect`)
- `AirportSelector` with RBAC filtering
- `KpiCard` (gradient — uses preserved hybrid CSS)
- `LineChart` + `DonutChart` wrappers
- `PrmDataService` — `forkJoin` of all Overview API calls
- `OverviewTabComponent` rendered inside `DashboardComponent`
- Smoke test for OverviewTab

### Phase 2 — Top10 tab (≈ 4–6 hrs)

- `HorizontalBarChartComponent`
- `Top10TabComponent`
- Audit for `p-table` / `p-paginator` use
- Smoke test for Top10Tab

### Phase 3 — Service Breakup tab (≈ 5–7 hrs)

- `SankeyChartComponent` (echarts 4 sankey — visual diff acceptable)
- `ServiceBreakupTabComponent`
- Smoke test for ServiceBreakupTab

### Phase 4 — Fulfillment tab (≈ 4–6 hrs)

- `HeatmapChartComponent`
- `FulfillmentTabComponent`
- Smoke test for FulfillmentTab

### Phase 5 — Insights tab (≈ 3–4 hrs)

- `InsightsTabComponent`
- Smoke test for InsightsTab

### Phase 6 — Polish & extras (≈ 8–12 hrs)

- `SavedViewsStore` (localStorage) + `SavedViewsMenu`
- `CommandPalette` (Ctrl/Cmd-K)
- `ToastContainer` (PrimeNG `MessageService` + `p-toast`)
- `[appTooltip]` directive deletion + `pTooltip` migration audit
- `NotFoundComponent` ("Flight diverted")
- `DevTenantPicker` (dev-only)
- `ProgressService` + global progress bar
- TSLint pass, fix warnings
- Production build + Docker image + smoke test against .NET backend

### Phase 7 — Cutover decision (≈ 2 hrs)

- Run both versions side-by-side (Angular 17 from `main` on :4200, Angular 8 from branch on :4201)
- Document visual deltas (theme, sankey/heatmap appearance, form-field interaction)
- Decide: merge to `main`, leave both branches alive, or hand off to host integration team

### Total estimate

| Phase | Hours |
|---|---|
| 0 — Foundation | 20–28 |
| 1 — Overview | 12–15 |
| 2 — Top10 | 4–6 |
| 3 — Service Breakup | 5–7 |
| 4 — Fulfillment | 4–6 |
| 5 — Insights | 3–4 |
| 6 — Polish | 8–12 |
| 7 — Cutover decision | 2 |
| **Total** | **58–80** |

---

## 13. Risks

### High-impact

- **R1 — PrimeNG 8.1.4 component rough edges.** Some props and modes may be flaky vs newer versions.
  *Mitigation:* PrimeNG smoke screen page in Phase 0 — visual sanity of every component before committing to broad use.

- **R2 — Custom `<app-form-field>` directive complexity.** Tracking focus / blur / value-presence / error across arbitrary `@ContentChild` PrimeNG controls is fiddly.
  *Mitigation:* Build it in Phase 0 against the login form (simplest case). Validate before applying broadly.

- **R3 — Host app integration mismatches.** Host team's eventual answers to U1–U8 may invalidate decisions made during the rewrite.
  *Mitigation:* Build swap-out points (theme files, login presence, route prefix) that are easily replaced. List explicit open questions.

### Medium-impact

- **R4 — echarts 4 visual differences in sankey/heatmap.** Flatter gradients, choppier transitions.
  *Mitigation:* Phase 7 side-by-side compare. If unacceptable, options: (a) accept (b) custom CSS overlays (c) revisit chart library.

- **R5 — TS 3.5 missing modern syntax.** `??` (TS 3.7+), `satisfies` (TS 4.9+), etc.
  *Mitigation:* TSLint rules in Phase 0 to flag, one-time audit + rewrite pass.

- **R6 — Bundle size.** Initial bundle ~2.2MB vs ~1.4MB today.
  *Mitigation:* Lazy-load all features. Per-module PrimeNG imports. Accept the floor.

- **R7 — Date-range picker preset/calendar interaction.** Custom logic, easy to subtly miswire.
  *Mitigation:* Port `date-presets.ts` verbatim (framework-agnostic). Only the calendar widget is new code.

### Low-impact

- **R8 — TSLint vs ESLint warning divergence.** Different rules will flag different code. Accept it.
- **R9 — RxJS 6 vs 7 operator signatures.** Mostly mechanical. Trust TypeScript for build-time errors.
- **R10 — Karma + old ChromeHeadless flag compatibility.** May fail to launch on modern Chromium. Known fix: upgrade `karma-chrome-launcher` to last 3.x release.

---

## 14. Open questions for the host team

These cannot be answered without contacting the host team. Defaults are chosen, but each is a swap-out point if the host team's answer differs.

| # | Question | Current default | Impact if changed |
|---|---|---|---|
| **U1** | Does host use NgRx / Akita / BehaviorSubject / something else for state? | BehaviorSubject services | ~10–15 hrs of store rewrite |
| **U2** | What PrimeNG theme does host use? | Material-themed PrimeNG (custom) | ~20 hrs of theme work discarded |
| **U3** | Does host handle auth (SSO)? Should we strip login? | Keep login | Reduces scope by ~4 hrs |
| **U4** | What route prefix does host expect us under? | `/prm-dashboard/*` | Trivial — single config change |
| **U5** | Does host use Angular CLI strict mode? | `strict: true` | Trivial — single config change |
| **U6** | Should we share `node_modules` with host or keep our own? | Separate `node_modules` | Possibly significant if host enforces shared lockfile |
| **U7** | Does host expect a single bundle or our own webpack output? | Our own bundle, served via host's index.html or sub-path | Possibly significant — may require eject + custom webpack |
| **U8** | Is host willing to upgrade past Angular 8? | Assume no | If yes — entire rewrite is unnecessary |

**Recommendation:** soft gate before Phase 0 — send these 8 questions to the host architect via email/Slack. Don't block scaffolding work on the response (scaffolding is reversible), but get answers in flight. U1, U2, U3, U7 are the four that most affect architecture.

---

## 15. Cutover checklist (Phase 7)

Before deciding to merge `angular-8-rewrite` → `main`:

- [ ] All 5 dashboard tabs render data from a real backend (not stubbed)
- [ ] Login → JWT → refresh → logout flow works end-to-end
- [ ] Multi-tenant subdomain resolution still works (test with at least 2 tenants)
- [ ] Airport RBAC enforced (test with employee whose JWT has `airports=DEL,BOM` — request to `?airport=HYD` returns 403)
- [ ] Theme toggle works (light / dark)
- [ ] Saved views persist across reloads
- [ ] Command palette (Ctrl/Cmd-K) opens and navigates
- [ ] All 8 smoke tests pass
- [ ] `ng build --configuration production` clean (no warnings, no errors)
- [ ] TSLint clean (or warnings explicitly accepted)
- [ ] Docker image builds and runs; healthcheck passes
- [ ] `docker compose up` brings up the full stack with v8 frontend
- [ ] Side-by-side visual comparison documented in a delta doc
- [ ] Host team's answers to U1–U8 reviewed; any incompatibilities resolved
- [ ] Cutover decision recorded: merge / both branches alive / hand off

---

## 16. Failure modes (explicit acceptance)

There are scenarios where this rewrite won't ship cleanly. Listed for honesty:

- **Host team says "actually we're on Angular 14 now"** — rewrite is wasted; Angular Elements would have been correct. *Mitigation:* check with host team before Phase 0.
- **Host team rejects PrimeNG-with-Material-theme as out of place** — ~20 hrs of theme work discarded; adopt host's theme.
- **Host team mandates NgRx classic** — BehaviorSubject stores discarded; ~10–15 hrs rebuild.
- **Host team mandates shared `node_modules` / shared webpack** — possibly significant ejection work; may require restructuring as a library project rather than a standalone app.

Phase 7 is the explicit checkpoint where these get caught. Pre-Phase 0 contact with the host architect is the cheapest insurance.
