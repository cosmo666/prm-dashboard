# Angular Frontend Conventions

## Stack

- **Angular 17+** with standalone components (NO NgModules)
- **TypeScript strict mode**
- **Angular Material 3** with a custom theme (Modern Hybrid: light background, gradient KPI cards, soft shadows)
- **Apache ECharts** via `ngx-echarts` — all charts wrap the shared `BaseChartComponent`
- **NgRx Signal Store** (`@ngrx/signals`) for shared state
- **RxJS** for HTTP streams (interop with Angular's HttpClient)
- **SCSS** for styling (no CSS modules, no styled-components)
- **Vite** via Angular CLI for dev server + builds

## Project structure

```
frontend/src/app/
├── core/                                  # Singletons: initialized once per app
│   ├── auth/
│   │   ├── auth.service.ts                # login/logout/refresh + /auth/me
│   │   ├── auth.guard.ts                  # CanActivateFn
│   │   ├── auth.interceptor.ts            # HttpInterceptorFn — attaches Bearer + 401 auto-refresh
│   │   └── tenant.resolver.ts             # Subdomain → tenant config
│   ├── api/
│   │   └── api.client.ts                  # Wrapper over HttpClient with base URL + withCredentials
│   ├── progress/
│   │   └── progress.service.ts            # In-flight counter for global top progress bar (start/stop/wrap)
│   ├── store/
│   │   ├── auth.store.ts                  # Employee, access token, airports
│   │   ├── tenant.store.ts                # Tenant slug, name, logo, primary color
│   │   ├── filter.store.ts                # Dashboard filters, URL-synced
│   │   └── navigation.store.ts            # Active dashboard tab name for breadcrumb
│   └── theme/
│       └── theme.service.ts               # Light/dark toggle + prefers-color-scheme
│
├── features/                              # Lazy-loaded route components
│   ├── auth/login/                        # Split-layout login page (mouse-parallax dark panel)
│   ├── home/                              # Dashboard tile picker
│   ├── not-found/                         # Editorial 404 — "Flight diverted" page
│   └── dashboard/                         # 4-tab PRM dashboard
│       ├── dashboard.component.ts
│       ├── components/
│       │   ├── filter-bar/                # Airline, service, handled_by, date range
│       │   ├── date-range-picker/         # 16 presets (Today, Last 7 Days, MTD, Q1-Q4, etc.)
│       │   └── kpi-card/                  # Gradient card with label, value, delta, icon
│       ├── services/
│       │   └── prm-data.service.ts        # Wraps all 19 /api/prm endpoints
│       ├── utils/
│       │   └── date-presets.ts            # resolvePreset(), PRESET_DEFS
│       └── tabs/
│           ├── overview/
│           ├── top10/
│           ├── service-breakup/
│           └── fulfillment/
│
└── shared/
    ├── charts/                            # ECharts wrapper components
    │   ├── base-chart.component.ts        # Loading state, empty state, common layout
    │   ├── bar-chart/
    │   ├── donut-chart/
    │   ├── line-chart/                    # Supports dualAxis, stacked, area
    │   ├── horizontal-bar-chart/
    │   ├── sankey-chart/
    │   └── heatmap-chart/
    ├── components/
    │   ├── top-bar/                       # Logo, tenant name, breadcrumb, airport selector, theme toggle
    │   ├── airport-selector/              # RBAC-filtered dropdown bound to FilterStore
    │   └── progress-bar/                  # 2px global top progress bar bound to ProgressService
    ├── directives/
    │   └── tooltip.directive.ts           # [appTooltip] — replaces matTooltip, body-portal, viewport-clamped
    └── pipes/
        └── compact-number.pipe.ts         # 15234 → "15.2k", 1.5M → "1.5M", null → "—"
```

## Component organization

- **One component per file**, PascalCase filename matching class name
- **Max 300 lines per file** — if growing beyond, split into sub-components or extract logic to a service
- **Standalone components only** — declare `imports: [...]` directly in the `@Component` decorator, no NgModules anywhere
- **`.ts`, `.html`, `.scss` triplet** for non-trivial components. Inline `template:` acceptable only for tiny wrappers (<40 lines)
- **camelCase** for utilities, services, and variables; **PascalCase** for classes, components, and interfaces

## State management

- **NgRx Signal Store for shared state** — auth, tenant, filters, any cross-component state
- **Component signals for local state** — `count = signal(0)`, prefer over `@Input`/`@Output` where possible
- **`computed()` for derived values** — never call signal getters inside template expressions that change per render; use `computed()` to memoize
- **`effect()` sparingly** — only for side effects (logging, persistence, re-fetching on filter change). Always pass `{ allowSignalWrites: true }` if the effect writes to other signals
- **URL-synced state via FilterStore** — filter state reads from/writes to URL query params so reloads don't lose the user's selections

Never use:

- ❌ `@ngrx/store` (the action/reducer version) — too heavy for this POC
- ❌ Direct `BehaviorSubject`/`Subject` for shared state — use Signal Store
- ❌ `localStorage` for access tokens (XSS risk) — keep in memory via `AuthStore`

## API integration

- **All API calls go through `ApiClient`** — NEVER inject `HttpClient` directly in a component or feature service
- **`ApiClient` prepends base URL** (`/api`), passes `withCredentials: true` for refresh cookie, and lets the interceptor handle auth headers
- **`PrmDataService` wraps all 19 PRM endpoints** — feature components inject it and call typed methods
- **Use RxJS `Observable<T>`** for HTTP calls — subscribe in components via `forkJoin` or `async` pipe
- **Always handle errors** — at minimum log and set a loading/error signal

## Auth flow

- **Access token in memory** via `AuthStore.accessToken()` — never persisted
- **Refresh token in httpOnly cookie** — set by the server, invisible to JS, safe from XSS
- **`AuthInterceptor` auto-refreshes on 401** — retries the original request with the new token. If refresh also fails, calls `AuthService.logout()` and redirects to `/login`
- **`AuthGuard` CanActivateFn** protects authenticated routes
- **`TenantResolver` runs before every route** to ensure tenant branding is loaded (cached after first load)

## Routing

- **Lazy-load via `loadComponent`:**

  ```ts
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) }
  ```

- **Route params → component inputs** via `withComponentInputBinding()` (Angular 16+)
- **Query params ↔ FilterStore** — the dashboard component reads initial filters from the URL and writes filter changes back (so the back button works and sharing URLs works)

## Styling

- **Angular Material 3 custom theme** in `src/styles/theme.scss`
- **Utility-first acceptable** but not mandatory (we're not using Tailwind — prefer component-scoped SCSS)
- **Mobile-first responsive** — test at 360px, 768px, 1024px, 1440px
- **Never use inline styles** except for truly dynamic values (e.g., chart colors from a config object)
- **SCSS variables in `src/styles/_variables.scss`** for colors, spacing, breakpoints. Use sparingly — prefer Material tokens where possible

## Charts

**Never use raw `echarts` or `ngx-echarts` directly in a feature component.** Always wrap via the shared `BaseChartComponent` family:

```html
<app-bar-chart title="Top Airlines" [data]="topAirlines()" [loading]="loading()"></app-bar-chart>
```

This guarantees consistent:

- Loading skeleton during fetch
- "No data matches current filters" empty state
- Hover effects and tooltip styling
- Card layout with padding/shadow

If you need a chart type that isn't wrapped yet, ADD a new wrapper in `shared/charts/` — don't drop `[echarts]` directives into feature components.

## RBAC in the UI

- **Role-based UI rendering** — the airport selector shows only airports from `AuthStore.employee()!.airports`
- **Route guards** — protected routes via `authGuard`; no unauthenticated access
- **Hide, don't disable, forbidden UI** — if a user can't interact with something, don't show it at all (disabled buttons are information leakage)

## Linting & build

- **ESLint** with `@angular-eslint` plugins + `@typescript-eslint`
- **TypeScript strict mode** — `strict: true`, `strictNullChecks: true`, `noImplicitAny: true`
- **`ng lint`** must pass before commits
- **`ng build --configuration production`** must succeed (no warnings ignored)
- **`ng test`** runs Karma + Jasmine; tests next to code (`foo.component.spec.ts` beside `foo.component.ts`)

## Commands

```bash
cd frontend
npm install                                # Install dependencies
npm start                                  # ng serve — dev server on :4200
npm run build                              # ng build --configuration production
npm test                                   # ng test
npm run lint                               # ng lint
```

## Anti-patterns to avoid

- ❌ NgModules — this project is 100% standalone
- ❌ `constructor(private http: HttpClient)` in feature code — use `ApiClient`
- ❌ `@ViewChild` for cross-component communication — use a shared store or signals
- ❌ Manual change detection (`ChangeDetectorRef.detectChanges()`) — zones + signals handle it
- ❌ `any` type — if you don't know the shape, write an interface
- ❌ Observable subscriptions without cleanup — use `takeUntilDestroyed()` or the `async` pipe
- ❌ Business logic in templates — move computed values to `computed()` signals or component methods
- ❌ Hardcoded API URLs — always via `environment.apiBaseUrl`
- ❌ `any`-typed API responses — always define a DTO interface that mirrors the backend record
- ❌ `matTooltip` — use the custom `[appTooltip]` directive (`shared/directives/tooltip.directive.ts`) so light/dark and styling stay consistent

## Tenant-aware behavior

The frontend runs for any tenant — never hardcode tenant slugs, airport codes, or service types beyond the 9 IATA SSR codes (see `prm-domain` skill):

- **Tenant slug** — extracted from `window.location.hostname` in `TenantResolver`, stored in `TenantStore`
- **Airports** — always read from `AuthStore.employee()!.airports` (comes from JWT claim)
- **Airlines/services in filters** — fetched dynamically from `/api/prm/filters/options`
- **Tenant branding** — logo and primary color applied from `TenantStore` — CSS custom properties are the cleanest way to theme
