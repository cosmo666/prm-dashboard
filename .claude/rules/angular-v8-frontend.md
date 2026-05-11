# Angular 8 Frontend Conventions (`frontend-v8/`)

> **Scope:** these rules apply to `frontend-v8/` only — the **Angular 8.2.14 + PrimeNG 8.0.3** build that lives at host port **4300** and exists to match the user's host-application stack. The Angular 17 build under `frontend/` (host port 4200) is covered by [`angular-frontend.md`](angular-frontend.md); switch rule files when you switch directories.
>
> Both frontends share one backend (gateway/auth/tenant/prm + the same per-tenant Parquet files) but the two stacks are nothing alike. Anything idiomatic in the Angular 17 build (signals, NgRx Signal Store, standalone components, Angular Material 3, ESLint, Vite) is **wrong here**. Always check the file path you're editing before applying conventions.

## Stack (pinned — see `frontend_version_pins.md`)

| Layer | Version | Notes |
|---|---|---|
| Angular | 8.2.14 | NgModules — standalone components do not exist |
| Angular CLI | 8.3.3 | Webpack 4 under the hood |
| TypeScript | 3.4.5 | No `?.`, no `??`, no `import type` |
| RxJS | 6.5.2 | `pipe`-style operators, `BehaviorSubject` for state |
| zone.js | 0.9.1 | |
| PrimeNG | 8.0.3 | `.ui-*` CSS classes (NOT `.p-*`) — see `primeng_8_class_prefix.md` |
| PrimeIcons | 2.0.0 | `<i class="pi pi-foo">` |
| PrimeFlex | 1.3.1 | `p-grid`/`p-col-*` utility classes |
| ngx-bootstrap | 5.1.0 | Available; not heavily used yet |
| echarts | 4.9.0 | v4 API — `LinearGradient` lives at `echarts.graphic.LinearGradient` |
| ngx-echarts | 5.2.2 | `[echarts]` directive; chart factory provided once at root |
| resize-observer-polyfill | 1.5.1 | Required by ngx-echarts on older browsers |
| Lint | TSLint 5.15.0 + codelyzer 5.1.2 | NOT ESLint |
| Tests | Karma 4.1 + Jasmine 3.4 | ChromeHeadlessNoSandbox launcher |
| Node (build) | 12.22.12 (alpine) | Host has Node 22; everything runs in dev container |

**Locked.** Don't bump versions without reading `frontend_version_pins.md` first — the host-app stack is fixed and overrides convenience.

## Dev container — every npm/ng/tsc invocation

The user's host has Node 22, not Node 12. Angular CLI 8 cannot run on Node 22. Every command in this file (and every plan) runs **inside the Phase 0 dev container** (`Dockerfile.dev`, gated under the `dev` compose profile):

```bash
# from the worktree root
docker compose run --rm frontend-dev npm install
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
docker compose run --rm frontend-dev npx ng build --configuration=production
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
```

**Never** suggest `cd frontend && npm install` or `ng serve` on the host — it will not work. See `runtime_docker.md`.

The `tsc --noEmit` form **must** include `-p tsconfig.app.json`. Bare `tsc --noEmit` walks `node_modules/@types` and chokes on `undici-types`'s modern TS syntax (template literal types) which TS 3.4.5 cannot parse.

## Project structure

```text
frontend/src/app/
├── app.module.ts                           # Root module — registers NgxEchartsModule.forRoot
├── app-routing.module.ts                   # Lazy routes via function-form loadChildren
├── app.component.{ts,html,scss}            # Subscribes to TenantStore.tenant$, sets --app-primary
│
├── core/                                   # Singletons — provided in CoreModule (imported once in AppModule)
│   ├── core.module.ts
│   ├── api/api.client.ts                   # Wraps HttpClient: prepends /api, withCredentials: true
│   ├── auth/
│   │   ├── auth.service.ts                 # /auth/login, /auth/refresh, /auth/me, /auth/logout
│   │   ├── auth.guard.ts                   # CanActivate via AuthStore.isAuthenticatedSnapshot
│   │   ├── auth.interceptor.ts             # Class-based HttpInterceptor; auto-refresh on 401
│   │   └── tenant.resolver.ts              # Resolve<Tenant> via /tenants/config
│   ├── store/                              # Plain RxJS BehaviorSubject services — no NgRx
│   │   ├── auth.store.ts                   # Employee + accessToken
│   │   ├── tenant.store.ts                 # Tenant slug, name, logoUrl, primaryColor
│   │   ├── filter.store.ts                 # Phase 1 — URL-synced dashboard filters
│   │   └── navigation.store.ts             # Phase 1 — active dashboard tab name
│   └── theme/theme.service.ts              # Swaps <link id="app-theme"> stylesheet
│
├── features/                               # Each = its own lazy NgModule (string-form deprecated; use function form)
│   ├── auth/                               # AuthModule + AuthRoutingModule + LoginComponent
│   ├── home/                               # HomeModule — workspace tile picker
│   ├── dashboard/                          # Phase 1+: DashboardModule + child routes per tab
│   ├── primeng-smoke/                      # Dev-only visual sanity page (env.smoke gate)
│   └── not-found/                          # Editorial 404
│
└── shared/
    ├── shared.module.ts                    # Re-exports common PrimeNG modules + ngx-echarts directive
    ├── components/form-field/              # Custom <app-form-field> — Material-style floated labels
    ├── charts/
    │   ├── base-chart/                     # Wraps ngx-echarts; loading + empty states
    │   ├── bar-chart/                      # Vertical bars
    │   ├── line-chart/                     # Phase 1
    │   ├── donut-chart/                    # Phase 1
    │   └── horizontal-bar-chart/           # Phase 1
    └── pipes/                              # Phase 1+ (compact-number etc.)
```

## NgModules — no standalone components

- **One feature, one module.** Every feature folder gets its own `*-routing.module.ts` + `*.module.ts` + the components it owns.
- **Lazy-load via the function form of `loadChildren`:**

  ```ts
  { path: 'dashboard', canActivate: [AuthGuard],
    loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule) }
  ```

  The string form (`'./features/dashboard/dashboard.module#DashboardModule'`) is deprecated — don't use it.
- **Components are declared in exactly one module** — usually the feature module. Shared components (`<app-form-field>`, chart wrappers) are declared **and exported** by `SharedModule`. Feature modules `import: [SharedModule]`.
- **Component selectors:** `app-` prefix, kebab-case.
- **Files:** `.ts`, `.html`, `.scss` triplet for non-trivial components. Inline `template:` only for tiny wrappers (<40 lines). One component per file. Max 300 lines.
- **camelCase** for utilities, services, variables; **PascalCase** for classes, components, interfaces.

## State management — BehaviorSubject services

- **No NgRx.** No `@ngrx/store`, no `@ngrx/signals`. Angular 8 has no signals — `signal()`, `computed()`, `effect()` do not exist.
- **One `*.store.ts` per concern** (`auth`, `tenant`, `filter`, `navigation`, `saved-views`). Each store:
  - Holds private `BehaviorSubject<T>` fields
  - Exposes `xxx$: Observable<T>` for templates (use `| async` pipe)
  - Exposes `get xxxSnapshot(): T` for synchronous reads inside services / guards / interceptors
  - Exposes derived streams via `combineLatest([...]).pipe(map(...), shareReplay(1))`
  - Mutates via `setXxx(value)` / `toggleXxx(item)` methods that call `_xxx$.next(...)`

**Subscription cleanup is your job.** No `takeUntilDestroyed()` (Angular 16+). Use:

```ts
private destroy$ = new Subject<void>();

ngOnInit() {
  this.foo$.pipe(takeUntil(this.destroy$)).subscribe(...);
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

Or use the `| async` pipe in templates wherever possible — Angular handles cleanup for you.

## API integration

- **All HTTP goes through `ApiClient`.** Never inject `HttpClient` directly in a component or feature service. `ApiClient` prepends the `/api` prefix and sets `withCredentials: true` (so the refresh-token cookie travels).
- **API path conventions** (after `/api`): `/auth/*`, `/tenants/*` (PLURAL), `/prm/*`. Call sites pass `/auth/login`, `/tenants/config`, `/prm/kpis/summary`. Do **not** pass `/api/auth/login` — `ApiClient` adds the `/api`.
- **DTOs mirror backend records.** Read `backend/src/PrmDashboard.Shared/DTOs/*.cs` **before** writing a frontend interface. Field names are camelCase on the wire (ASP.NET Core's default `JsonNamingPolicy`). Phase 0 caught five integration bugs from inventing DTO shapes — see `phase0_dto_alignment_lessons.md`. The rule:
  - Open the relevant controller (`backend/src/PrmDashboard.PrmService/Controllers/*.cs`) — check the route, query-param shape, DTO type.
  - Open the DTO file (`PrmDashboard.Shared/DTOs/*.cs`) — copy the record's field names verbatim, lowercasing the first letter of each.
  - Don't infer from old frontend code (the Angular 17 source on `main` has its own DTO file, but it can drift); the C# record is authoritative.
- **Login:** `POST /auth/login` body is `{ username, password }` — *not* `{ email, password }`. The backend `LoginRequest` is `(string Username, string Password)`.
- **`AuthInterceptor`** attaches `Bearer <accessToken>`, retries on 401 by calling `auth.refresh()` once, and on refresh failure calls `auth.logout()` + redirects to `/login`. Skip the refresh logic when the failing request is itself `/auth/refresh` to avoid an infinite loop.

## Charts

- **Always wrap in `BaseChartComponent` (or a child wrapper).** Never put `[echarts]` directly into a feature template.
- `BaseChartComponent` lives at `shared/charts/base-chart/`. It owns the loading skeleton, the "No data matches current filters" empty state, the card chrome (border, padding, shadow), and the `[autoResize]="true"` wiring.
- **Per-chart-type wrapper.** `BarChartComponent`, `LineChartComponent`, `DonutChartComponent`, `HorizontalBarChartComponent`, etc. Each takes typed `@Input()` data, builds an `EChartOption` in `ngOnChanges`, and passes it to `<app-base-chart>`. New chart type → add a new wrapper, don't reach for raw `echarts`.
- **echarts 4 quirks:**
  - `echarts.graphic.LinearGradient` is the path (was identical in v5).
  - `dataset` source binding is limited; we don't use it.
  - `markLine` / `markArea` work the same as v5.
  - Sankey gradients are flatter than v5; accept the visual delta.
- **Chart factory provided once.** `NgxEchartsModule.forRoot({ echarts: () => import('echarts') })` is in `AppModule`. `SharedModule` re-exports the bare `NgxEchartsModule` (its directive only). Lazy feature modules `import: [SharedModule]` resolve the existing root provider; do **not** call `.forRoot` again or you get parallel chart factories.

## Auth flow

- **Access token in memory** via `AuthStore` (BehaviorSubject). Not in `localStorage` (XSS risk).
- **Refresh token** in httpOnly cookie set by the server. Invisible to JS, sent automatically when `withCredentials: true`.
- **`AuthGuard`** uses `AuthStore.isAuthenticatedSnapshot` for synchronous routing decisions.
- **`TenantResolver`** runs before any tenant-scoped route to populate `TenantStore`.

## Routing

- **Function-form `loadChildren`:**

  ```ts
  loadChildren: () => import('./features/x/x.module').then(m => m.XModule)
  ```

- **Route data** for breadcrumbs / tab names: `data: { title: 'Overview' }`, read by a `NavigationStore` subscriber.
- **Query params for filters** — `FilterStore` (Phase 1) reads from `route.queryParams` on entry, writes back on every change via `router.navigate([], { queryParams, queryParamsHandling: 'merge' })`. Reload restores filters; URL sharing works.
- **Route-level RBAC.** Hide-don't-disable. If the user has no airports, hide the dashboard entry on `/home` rather than rendering a disabled route.

## Styling — "Operations Console" design system

See `design_direction.md`. The PrimeNG default 2019 look has been replaced wholesale with our own system.

- **Typography:** Fira Sans (UI), Fira Code (data, identifiers, KPI numerics, floated form labels). Loaded via Google Fonts in `index.html`. **Not** Inter, Roboto, or system-ui.
- **Colors:** Indigo `#2563EB` primary, slate ramp, surgical 4-step elevation (`--elev-0` … `--elev-3`). Tokens live in `_variables.scss` + `_material-tokens.scss`.
- **Per-tenant primary.** `AppComponent.ngOnInit` subscribes to `TenantStore.tenant$` and writes `primaryColor` to `:root` as `--app-primary`. Hover/active/soft variants are derived in CSS via `color-mix(in oklch, var(--app-primary) NN%, ...)`. The override cascades automatically — never hardcode tenant slugs or colors in components.
- **PrimeNG 8.0.3 limitation.** PrimeNG themes don't honor CSS custom properties (those landed in PrimeNG 11+). Override colors by writing rules against the `.ui-*` selectors in `primeng-overrides.scss`:

  ```scss
  .ui-button.ui-button-primary {
    background: var(--app-primary);
    border-color: var(--app-primary);
  }
  ```

  See `primeng_8_class_prefix.md` for the full list of 8.0.3 class names. **`.p-button`, `.p-dropdown` etc. do nothing in PrimeNG 8.0.3** — those came in PrimeNG 9.
- **`primeng.min.css` is empty** in 8.0.3 (a known packaging bug). Import `primeng/resources/primeng.css` instead. See `primeng_theme_pair.md`.
- **Style import order in `styles.scss`** matters:
  1. PrimeNG base (`primeng.css`) + PrimeFlex
  2. Design tokens (`_variables.scss`, `_material-tokens.scss`)
  3. Component partials (`_form-field.scss`, `_kpi-cards.scss`, etc.)
  4. `primeng-overrides.scss` last — same-specificity wins by source order.
- **Inline styles only for truly dynamic values** (e.g., chart colors from a config object). Component-scoped SCSS otherwise.

## Custom `<app-form-field>` — distinguishing detail

Material-style floated label + animated underline, wrapping any PrimeNG input. Used for **all** form inputs — never raw `<input>` + separate `<label>`.

- The floated label rises into **uppercase Fira Code** on focus (the design's signature touch). All styling lives in `_form-field.scss`; the component just toggles `is-focused` / `has-value` / `has-error` host classes via DOM-event listeners on the projected input.
- The component scans for the inner control via `this.host.nativeElement.querySelector('input, textarea, select, .ui-dropdown, .ui-multiselect, .ui-calendar')`. Note the `.ui-*` prefix — **must match PrimeNG 8.0.3** (would silently miss controls if you typed `.p-*`).

```html
<app-form-field label="Username" [hint]="'Your work email'" [error]="form.controls.username.errors?.required ? 'Required' : ''">
  <input pInputText formControlName="username" />
</app-form-field>
```

## Airport filter (multi-select, RBAC-scoped)

- **Shape:** `FilterStore.airport: string[]`. URL: `?airport=DEL,BOM` (comma-delimited, identical to `airline`, `service`, `handled_by`).
- **Methods:** `setAirport(value: string | string[] | null)`, `toggleAirport(code)`, `removeAirport(code)`. Don't patch the array directly.
- **Empty check:** `filters.airport.length === 0`, **not** `!filters.airport` — array is always truthy.
- **RBAC enforcement.** Airports come from JWT — read via `AuthStore.airportCodes$` / `airportCodesSnapshot` (`EmployeeDto.airports: AirportDto[]` → just the codes). The airport selector hides codes outside the user's claim; the backend `AirportAccessMiddleware` 403s any request that passes a code outside the claim. **Hide, don't disable** — disabled buttons leak information about other tenants' airports.
- **Invariant:** never let the user de-select the last airport. The selector guards against it so the dashboard always has data to render.

## TypeScript 3.4.5 quirks

The TS version is locked to match the host app. Some modern syntax is unavailable:

- ❌ Optional chaining `obj?.prop` → ✅ `obj && obj.prop`
- ❌ Nullish coalescing `value ?? fallback` → ✅ `value || fallback` (acceptable when `0` / `''` / `false` aren't valid values) or a ternary `value !== null && value !== undefined ? value : fallback`
- ❌ `import type { Foo } from './bar'` → ✅ `import { Foo } from './bar'` (TS 3.8+ feature)
- ❌ Logical assignment (`||=`, `??=`, `&&=`) — TS 4.0+
- ❌ `satisfies` operator — TS 4.9+
- ❌ Template literal types (`` `prefix-${T}` ``) — TS 4.1+

TSLint warns when you slip — but the safer guard is `npx tsc --noEmit -p tsconfig.app.json` in the dev container.

## Linting

- **TSLint 5.15.0 + codelyzer 5.1.2.** Not ESLint. The Angular 17 ESLint setup on `main` does not apply here.
- `npm run lint` must pass before commits.
- See the `_documentation` block in `tslint.json` for rule rationale (private-field underscore convention, line length, etc.).

## Testing

- **Karma 4.1 + Jasmine 3.4** — same as before, different launcher config.
- Run with: `docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox`
- The `ChromeHeadlessNoSandbox` custom launcher (in `karma.conf.js`) passes `--no-sandbox --disable-dev-shm-usage --disable-gpu` so chromium runs cleanly inside the container.
- Tests sit beside the code (`foo.component.spec.ts` next to `foo.component.ts`).
- For components that consume `BaseChartComponent` or `<app-form-field>`, import `SharedModule` in the `TestBed`, and stub the data services (`PrmDataService`, `FilterStore`).

## Anti-patterns to avoid (Angular 8 specific)

- ❌ **Standalone components** — Angular 8 doesn't support them. Always declare in an `@NgModule`.
- ❌ **`signal()`, `computed()`, `effect()`** — none of these exist in Angular 8. Use `BehaviorSubject` + `combineLatest` + `map` + `shareReplay(1)`.
- ❌ **`inject()` function** — not in Angular 8. Constructor injection only.
- ❌ **`@ngrx/signals`, `@ngrx/store`, NgRx anything** — see "State management" above.
- ❌ **Direct `HttpClient` injection** in feature code — use `ApiClient`.
- ❌ **`?.` and `??`** — TS 3.4 incompat.
- ❌ **`.p-*` CSS prefix** — that's PrimeNG 9+. We're on 8.0.3, which uses `.ui-*`.
- ❌ **`matTooltip`** — that's Angular Material. Use `pTooltip` (PrimeNG).
- ❌ **`@if` / `@for` / `@switch`** control flow blocks — those are Angular 17+. Use `*ngIf`, `*ngFor`, `*ngSwitch`.
- ❌ **`takeUntilDestroyed()`** — Angular 16+. Use `takeUntil(this.destroy$)`.
- ❌ **Inventing DTO shapes** — read `backend/src/PrmDashboard.Shared/DTOs/*.cs` first. See `phase0_dto_alignment_lessons.md`.
- ❌ **Hardcoded API URLs** — always `environment.apiBaseUrl` (which is `''` in production, behind nginx; `''` in dev because the proxy handles it).
- ❌ **Hardcoded tenant slugs / airports / colors** — read from `TenantStore` / `AuthStore`.
- ❌ **`any`-typed API responses** — define a DTO interface mirroring the backend record. `forkJoin` results are type-inferred as long as you type each call.
- ❌ **Purple-on-white gradients, rainbow KPI cards, Inter font, generic Material 3 tokens** — these were the AI defaults in the Angular 17 design and were explicitly rejected during the rewrite. The "Operations Console" design system is the single source of truth — see `design_direction.md`.

## Tenant-aware behavior

- **Tenant slug** — extracted from `window.location.hostname` in `TenantResolver`, stored in `TenantStore`.
- **Per-tenant primary color** — `AppComponent` writes `--app-primary: <tenant.primaryColor>` to `:root`. Hover/active/soft variants derive via `color-mix()` so a single override cascades.
- **Airports** — always from `AuthStore.airportCodes$` (JWT claim). Selected airport(s) live in `FilterStore.airport: string[]`.
- **Filter options** (airlines, services, handledBy) — fetched per-airport-set from `/prm/filters/options`.
- **Logo** — `TenantStore.tenant$.logoUrl` rendered in the top bar.

Last updated: 2026-05-05.
