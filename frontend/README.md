# `frontend/` — PRM Dashboard (Angular 17)

Primary frontend for the [PRM Dashboard](../README.md), served on host port **4200**. Co-located on `main` with the host-app-parity [`frontend-v8/`](../frontend-v8/) build (Angular 8 + PrimeNG, host port 4300); both proxy to the same Ocelot gateway and read the same per-tenant Parquet files.

Project-wide guidance lives in [`../CLAUDE.md`](../CLAUDE.md); conventions specific to this build live in [`../.claude/rules/angular-frontend.md`](../.claude/rules/angular-frontend.md).

## Tech stack

| Layer | Version | Notes |
| --- | --- | --- |
| Angular | **17.3.x** | Standalone components only — no NgModules |
| Angular CLI | 17.3.x | Vite-backed dev server / esbuild production build |
| TypeScript | 5.4.x (strict) | `strictNullChecks`, `noImplicitAny` on |
| RxJS | 7.x | Mostly used at HTTP boundaries; UI state is signals |
| Angular Material | 3 | Custom theme (Modern Hybrid: light background, gradient KPI cards, soft shadows) |
| @angular/cdk | 17.3.x | Overlay-prebuilt CSS for floating UI |
| State management | **NgRx Signal Store** (`@ngrx/signals`) | Shared state; component signals for local state |
| Charts | Apache ECharts via `ngx-echarts` | All charts wrap `BaseChartComponent` |
| HTTP | Angular `HttpClient` behind `ApiClient` | All calls go through the wrapper — never inject `HttpClient` directly |
| Styling | SCSS | Material 3 tokens + component-scoped styles |
| Lint | `@angular-eslint@17` + `@typescript-eslint@7` + `eslint@8` | `npm run lint` must pass |
| Tests | Karma + Jasmine | `npm test` |
| Node (build) | 20.x (alpine) | Standard Angular CLI build pipeline |

## Architectural conventions

- **Standalone components only.** Declare `imports: [...]` directly in `@Component`; no NgModules anywhere in this build. (Contrast with [`frontend-v8/`](../frontend-v8/), which is NgModule-based by necessity of Angular 8.)
- **NgRx Signal Store for shared state.** Auth, tenant, filters, navigation, saved-views all live in `core/store/*.store.ts`. Component-local state uses bare `signal()` + `computed()`.
- **Lazy routes via `loadComponent`:** every feature is its own chunk — `loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)`.
- **URL-synced filters.** `FilterStore` reads from / writes to `route.queryParams` so reloads restore state and URLs are shareable.
- **HTTP via `ApiClient`.** Prepends `/api`, sets `withCredentials: true`. Never inject `HttpClient` in a feature component.
- **Charts wrap `BaseChartComponent`.** Six wrappers under `shared/charts/`: bar, donut, line, horizontal-bar, sankey, heatmap. Never drop `[echarts]` directives into feature templates.
- **`[appTooltip]` not `matTooltip`.** Custom directive in `shared/directives/tooltip.directive.ts` for consistent theming.
- **TypeScript strict.** No `any` (eslint-disable on intentional ECharts handlers only). DTOs mirror backend `record` types in `backend/src/PrmDashboard.Shared/DTOs/*.cs` exactly.

## Project layout

```text
src/app/
├── core/                                # Singletons
│   ├── api/api.client.ts                # HttpClient wrapper (/api + withCredentials)
│   ├── auth/                            # auth.service / auth.guard / auth.interceptor / tenant.resolver
│   ├── progress/progress.service.ts     # Global top progress bar
│   ├── store/                           # Signal Stores (auth, tenant, filter, navigation, saved-views)
│   ├── toast/toast.service.ts
│   └── theme/theme.service.ts
├── features/                            # Lazy-loaded route components
│   ├── auth/login/                      # Split-layout login (mouse-parallax dark panel)
│   ├── home/                            # Dashboard tile picker
│   ├── not-found/                       # Editorial 404 — "Flight diverted"
│   └── dashboard/                       # 5-tab PRM dashboard
│       ├── tabs/{overview,top10,service-breakup,fulfillment,insights}/
│       ├── components/{filter-bar,date-range-picker,kpi-card}/
│       └── services/prm-data.service.ts # Wraps all 25 /api/prm endpoints
└── shared/
    ├── charts/                          # ECharts wrappers
    ├── components/                      # TopBar, AirportSelector, ProgressBar, CommandPalette, …
    ├── directives/tooltip.directive.ts  # [appTooltip]
    └── pipes/compact-number.pipe.ts     # 15234 → "15.2k"
```

## Commands

```bash
npm install                                  # Install deps
npm start                                    # ng serve — dev server on :4200
npm run build                                # ng build --configuration production
npm test                                     # Karma + Jasmine
npm run lint                                 # @angular-eslint + @typescript-eslint
```

All commands run directly on the host (Node 20). No dev container required (unlike `frontend-v8/`, which needs Node 12).

## Production container (runtime)

A separate nginx image ([`Dockerfile`](Dockerfile)) builds the production bundle and serves it on container port 80; the host maps it to **`:4200`**. Nginx proxies `/api/*` to the gateway via the internal Docker network.

```bash
docker compose up -d --build frontend                # → http://localhost:4200
```
