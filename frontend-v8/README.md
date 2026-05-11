# `frontend-v8/` — PRM Dashboard (Angular 8 + PrimeNG)

Host-app-parity frontend for the [PRM Dashboard](../README.md). Lives alongside the Angular 17 build at [`frontend/`](../frontend/); both proxy to the same Ocelot gateway and read the same per-tenant Parquet files, so switching between [`http://aeroground.localhost:4200`](http://aeroground.localhost:4200) and [`http://aeroground.localhost:4300`](http://aeroground.localhost:4300) shows the same tenant in two different UI stacks.

Project-wide guidance lives in [`../CLAUDE.md`](../CLAUDE.md); conventions specific to this build live in [`../.claude/rules/angular-v8-frontend.md`](../.claude/rules/angular-v8-frontend.md).

## Tech stack (locked — must match the host application)

| Layer | Version | Notes |
| --- | --- | --- |
| Angular | **8.2.14** | NgModules; standalone components do not exist |
| Angular CLI | **8.3.3** | webpack 4 under the hood |
| TypeScript | **3.4.5** | No `?.`, no `??`, no `import type`, no template-literal types |
| RxJS | **6.5.2** | `pipe`-style operators; `BehaviorSubject` for state |
| zone.js | 0.9.1 | |
| PrimeNG | **8.0.3** | `.ui-*` CSS classes (NOT `.p-*` — that's 9+) |
| PrimeIcons | **2.0.0** | `<i class="pi pi-foo">` |
| PrimeFlex | 1.3.1 | `p-grid` / `p-col-*` utility classes |
| @angular/cdk | 8.2.3 | Required by PrimeNG's Dropdown (cdk virtual scroll) |
| ngx-bootstrap | **5.1.0** | Pinned to match host-app stack; available for any feature that needs it |
| echarts | 4.9.0 | v4 API — `LinearGradient` lives at `echarts.graphic.LinearGradient` |
| ngx-echarts | 5.2.2 | `[echarts]` directive; chart factory provided once at root |
| resize-observer-polyfill | 1.5.1 | Required by ngx-echarts on older browsers |
| Lint | TSLint 5.15.0 + codelyzer 5.1.2 | NOT ESLint |
| Tests | Karma 4.1 + Jasmine 3.4 | `ChromeHeadlessNoSandbox` launcher |
| Node (build) | 12.22.12 (alpine) | Host has Node 22; everything runs in dev container |

**Locked.** Don't bump versions — the host-application stack is fixed and overrides convenience.

## Architectural conventions

- **NgModules everywhere.** One module per feature (`AuthModule`, `HomeModule`, `DashboardModule`, …), each owns its components and its routing module. Shared widgets sit in `SharedModule`. Standalone components do not exist on this Angular version.
- **Plain RxJS service-based state.** No NgRx. Each shared concern (`AuthStore`, `TenantStore`, `FilterStore`, `NavigationStore`, `SavedViewsStore`) is a service that wraps private `BehaviorSubject<T>` fields, exposes `xxx$: Observable<T>` for templates (consumed via `| async`) and `xxxSnapshot: T` for synchronous reads in guards / interceptors.
- **Standard Angular CLI build.** No custom webpack, no Vite, no Nx — `ng build`, `ng serve`, `ng test`, `ng lint` only.
- **Routing: lazy-loaded modules via function-form `loadChildren`** — `loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule)`. The deprecated string form (`'./path#Module'`) is not used.
- **Subscriptions:** prefer the `| async` pipe in templates. Manual subscriptions cleaned up via `takeUntil(this.destroy$)` in `ngOnDestroy` — `takeUntilDestroyed()` is Angular 16+ and unavailable here.
- **HTTP via `ApiClient`.** Never inject `HttpClient` directly in a feature service or component.
- **Charts wrap `BaseChartComponent`.** Never put `[echarts]` directly into a feature template.
- **TS 3.4 limitations:** use `obj && obj.prop` not `obj?.prop`; use `value || fallback` (or a ternary) not `value ?? fallback`; no `import type`, no `satisfies`, no logical assignment.

## Project layout

```text
src/app/
├── app.module.ts                    # Registers NgxEchartsModule.forRoot
├── app-routing.module.ts            # Function-form lazy routes
├── core/                            # Singletons (provided in CoreModule)
│   ├── api/api.client.ts            # Wraps HttpClient (/api prefix + withCredentials)
│   ├── auth/                        # auth.service / auth.guard / auth.interceptor / tenant.resolver
│   ├── store/                       # BehaviorSubject-based stores
│   └── theme/theme.service.ts
├── features/                        # Each = its own lazy NgModule
│   ├── auth/                        # Login
│   ├── home/                        # Workspace tile picker
│   ├── dashboard/                   # 5-tab PRM dashboard
│   └── not-found/                   # Editorial 404
└── shared/
    ├── shared.module.ts             # Re-exports common PrimeNG modules + ngx-echarts
    ├── components/form-field/       # Custom <app-form-field> with floated Fira Code labels
    ├── charts/                      # base / bar / line / donut / horizontal-bar wrappers
    └── pipes/
```

## Dev container — every command runs here

The host has Node 22, which Angular CLI 8 cannot use. The `frontend-v8-dev` service (gated under the `dev` compose profile, see [`../docker-compose.yml`](../docker-compose.yml)) is a Node 12 + Chromium image that bind-mounts this directory.

```bash
# From the repo root
docker compose --profile dev build frontend-v8-dev                          # one-time
docker compose run --rm frontend-v8-dev npm install
docker compose run --rm frontend-v8-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-v8-dev npm run lint                        # TSLint
docker compose run --rm frontend-v8-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-v8-dev npx ng build --configuration=production
```

> `npx tsc --noEmit` **must** include `-p tsconfig.app.json`. Bare `tsc --noEmit` walks `node_modules/@types` and chokes on modern TS syntax in upstream types that TS 3.4.5 can't parse.

## Production container (runtime)

A separate nginx image ([`Dockerfile`](Dockerfile)) builds the production bundle and serves it on container port 80; the host maps it to **`:4300`**. Nginx proxies `/api/*` to the gateway via the internal Docker network ([`nginx.conf`](nginx.conf)).

```bash
docker compose up -d --build frontend-v8                # → http://localhost:4300
```

## "Operations Console" design system

Indigo `#2563EB` primary, slate ramp, Fira Sans (UI) + Fira Code (numerics / IDs / floated form-field labels). See `_variables.scss` / `_material-tokens.scss` / `primeng-overrides.scss`. The PrimeNG 8.0.3 default theme is overridden wholesale via `.ui-*` selectors — PrimeNG 8 doesn't honour CSS custom properties for theming (that's 11+), so per-tenant primary colours cascade via a `--app-primary` CSS variable set on `:root` by `AppComponent` and consumed in the override stylesheet.
