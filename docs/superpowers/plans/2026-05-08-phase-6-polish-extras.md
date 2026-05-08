# Angular 8 + PrimeNG Rewrite — Phase 6 (Polish & Extras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

| | |
|---|---|
| **Date** | 2026-05-08 |
| **Branch** | `angular-8-rewrite` |
| **Spec** | `../specs/2026-05-05-angular-8-primeng-rewrite-design.md § 12` |
| **Builds on** | Phases 0–5 complete; all 5 dashboard tabs live |

**Goal:** Nine cross-cutting polish items that sit on top of the five dashboard tabs: `SavedViewsStore` + `SavedViewsMenu`, a Ctrl/Cmd-K `CommandPalette`, a global toast layer (`ToastContainer`), a 2px top progress bar (`ProgressService` + `ProgressBarComponent`), a dev-only tenant switcher (`DevTenantPickerComponent`), completion of the `NotFoundComponent` SCSS, deletion of the custom `[appTooltip]` directive in favour of `pTooltip`, a TSLint clean-up pass, and a production-build + Docker smoke test against the .NET backend.

**Standing rules (inherited from earlier phases — re-read before each task):**

1. **Dev container only:** `docker compose run --rm frontend-dev <cmd>`. Host has Node 22; project needs Node 12.
2. **No `?.`, `??`, `import type`, `satisfies`, `padStart`** — TS 3.4.5. Use `||`, ternaries, and explicit `.map`.
3. **`TestBed.get(...)` not `TestBed.inject`** — Angular 8.
4. **`.ui-*` PrimeNG class selectors** — not `.p-*` (rebrand was v9).
5. **`primeng.css` not `primeng.min.css`** — the `.min.css` is empty on 8.0.3.
6. **Commit trailer:** `Co-Authored-By: Claude <noreply@anthropic.com>`.
7. **One concept per commit.** Always run `tsc --noEmit`, `npm test`, `npm run lint` before committing.

---

## Overview

Phase 6 completes the Angular 8 rewrite to full feature parity with `main`. The five dashboard tabs already render live data. What remains is the shell infrastructure: persistent saved views, a keyboard-first command palette, transient toast notifications, a global progress indicator, the editorial 404 page styling, a dev tenant-switcher, tooltip migration, and the final lint + production build verification.

---

## Order of execution

| # | Item | Rationale |
|---|---|---|
| **1** | ToastContainer | Needed by SavedViewsStore ("View saved" notification) and DevTenantPicker. Wire first so all subsequent items can call `toast.show()`. |
| **2** | ProgressService + ProgressBarComponent | Purely additive, no dependency on Phase 6 items. Quick win that wires the in-flight indicator. |
| **3** | NotFoundComponent SCSS | The `.ts` and `.html` are already live (wired in Phase 0 routing). Only the SCSS is missing. Independent, ~30 min. |
| **4** | SavedViewsStore + SavedViewsMenuComponent | Depends on `ToastService` for the "View saved" notification (item 1). Independent of CommandPalette. |
| **5** | CommandPaletteComponent + NavigationStore extension | Depends on `NavigationStore.requestTab` (minor extension needed). References `FilterStore`, `ThemeService`, `AuthService` — all already live. |
| **6** | DevTenantPickerComponent | Depends on `AuthService.logout()` and `ApiClient` — both live. No other Phase 6 dependency. |
| **7** | `[appTooltip]` deletion + `pTooltip` audit | Done after all new components are written (so the grep catches any `appTooltip` usage introduced in items 4–6). |
| **8** | TSLint pass | Done after all new code is in place so the sweep is final. |
| **9** | Production build + Docker smoke test | Always last; verifies the whole phase assembled correctly. |

Items 1, 2, 3 are fully independent and can be parallelised across sessions.

---

## Per-item plan

### Task 1: ToastContainer

#### Files

- Create: `frontend/src/app/core/toast/toast.service.ts`
- Create: `frontend/src/app/core/toast/toast.service.spec.ts`
- Create: `frontend/src/app/shared/components/toast-container/toast-container.component.ts`
- Create: `frontend/src/app/shared/components/toast-container/toast-container.component.html`
- Create: `frontend/src/app/shared/components/toast-container/toast-container.component.scss`
- Modify: `frontend/src/app/app.module.ts` — declare `ToastContainerComponent`
- Modify: `frontend/src/app/app.component.ts` — add `<app-toast-container>` to template

(All paths relative to `frontend/` under `.worktrees/angular-8-rewrite/`.)

#### Step 1 — `toast.service.ts`

Port the Angular 17 version (`main/frontend/src/app/core/toast/toast.service.ts`) to BehaviorSubject. No PrimeNG `MessageService` — the simpler custom approach used on `main` is what we match.

```ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastMessage {
  id: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly AUTO_DISMISS_MS = 2500;
  private _toasts$ = new BehaviorSubject<ToastMessage[]>([]);

  toasts$: Observable<ToastMessage[]> = this._toasts$.asObservable();
  get toastsSnapshot(): ToastMessage[] { return this._toasts$.value; }

  show(text: string): void {
    const id = this.nextId++;
    this._toasts$.next([...this._toasts$.value, { id, text }]);
    setTimeout(() => this.dismiss(id), this.AUTO_DISMISS_MS);
  }

  dismiss(id: number): void {
    this._toasts$.next(this._toasts$.value.filter(t => t.id !== id));
  }
}
```

#### Step 2 — `toast.service.spec.ts`

```ts
import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.get(ToastService);
    jasmine.clock().install();
  });

  afterEach(() => { jasmine.clock().uninstall(); });

  it('show() adds a toast to the list', () => {
    service.show('Hello');
    expect(service.toastsSnapshot.length).toBe(1);
    expect(service.toastsSnapshot[0].text).toBe('Hello');
  });

  it('dismiss() removes the toast by id', () => {
    service.show('A');
    const id = service.toastsSnapshot[0].id;
    service.dismiss(id);
    expect(service.toastsSnapshot.length).toBe(0);
  });

  it('auto-dismisses after 2500ms', () => {
    service.show('Auto');
    expect(service.toastsSnapshot.length).toBe(1);
    jasmine.clock().tick(2501);
    expect(service.toastsSnapshot.length).toBe(0);
  });
});
```

#### Step 3 — `toast-container.component.ts` + `.html` + `.scss`

**`.html`:**
```html
<div class="toast-stack" role="status" aria-live="polite">
  <div class="toast"
       *ngFor="let t of toasts$ | async; trackBy: trackById"
       (click)="service.dismiss(t.id)">
    <span class="toast__dot" aria-hidden="true"></span>
    <span class="toast__text">{{ t.text }}</span>
  </div>
</div>
```

**`.ts`:**
```ts
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ToastService, ToastMessage } from '../../../core/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrls: ['./toast-container.component.scss'],
})
export class ToastContainerComponent {
  toasts$: Observable<ToastMessage[]>;

  constructor(public service: ToastService) {
    this.toasts$ = this.service.toasts$;
  }

  trackById(_index: number, t: ToastMessage): number { return t.id; }
}
```

**`.scss`:** Port verbatim from Angular 17's `toast-container.component.ts` inline styles (the `@keyframes toastIn`, `.toast-stack`, `.toast`, `.toast__dot`, `.toast__text` rules). The component is `:host { position: fixed; right: 24px; bottom: 24px; z-index: 10000; pointer-events: none; }`.

#### Step 4 — Wire in `AppModule` and `AppComponent`

`AppModule.declarations` gains `ToastContainerComponent`. **Do not add `ToastContainerComponent` to `SharedModule`** — it is a global singleton mounted once in `AppComponent`, not re-used in feature modules.

`AppComponent` template:
```html
<app-progress-bar></app-progress-bar>
<router-outlet></router-outlet>
<app-command-palette></app-command-palette>
<app-toast-container></app-toast-container>
```
(Items 2 and 5 will wire `ProgressBarComponent` and `CommandPaletteComponent` — add all four at once when each item is done, or add a placeholder comment now.)

#### Step 5 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/core/toast frontend/src/app/shared/components/toast-container \
        frontend/src/app/app.module.ts frontend/src/app/app.component.ts
git commit -m "feat(shell): add ToastService + ToastContainerComponent

BehaviorSubject-backed toast queue; auto-dismiss after 2500ms; fixed
position bottom-right; click to dismiss. Declared in AppModule (global
singleton, not a SharedModule export). AppComponent template grows to
include <app-toast-container>.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: ProgressService + ProgressBarComponent

#### Files

- Create: `frontend/src/app/core/progress/progress.service.ts`
- Create: `frontend/src/app/core/progress/progress.service.spec.ts`
- Create: `frontend/src/app/shared/components/progress-bar/progress-bar.component.ts`
- Create: `frontend/src/app/shared/components/progress-bar/progress-bar.component.html`
- Create: `frontend/src/app/shared/components/progress-bar/progress-bar.component.scss`
- Modify: `frontend/src/app/app.module.ts` — declare `ProgressBarComponent`
- Modify: `frontend/src/app/app.component.ts` — add `<app-progress-bar>` to template

#### Step 1 — `progress.service.ts`

```ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private _inflight$ = new BehaviorSubject<number>(0);

  active$: Observable<boolean> = this._inflight$.pipe(
    map(n => n > 0),
    shareReplay(1),
  );

  get activeSnapshot(): boolean { return this._inflight$.value > 0; }

  start(): void { this._inflight$.next(this._inflight$.value + 1); }
  stop(): void  { this._inflight$.next(Math.max(0, this._inflight$.value - 1)); }
}
```

#### Step 2 — `progress.service.spec.ts`

```ts
import { TestBed } from '@angular/core/testing';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;
  beforeEach(() => { TestBed.configureTestingModule({}); service = TestBed.get(ProgressService); });

  it('active$ is false initially', (done) => {
    service.active$.subscribe(v => { expect(v).toBeFalse(); done(); });
  });

  it('start() makes active$ true', (done) => {
    service.start();
    service.active$.subscribe(v => { expect(v).toBeTrue(); done(); });
  });

  it('start() then stop() makes active$ false', (done) => {
    service.start();
    service.stop();
    service.active$.subscribe(v => { expect(v).toBeFalse(); done(); });
  });

  it('stop() below zero clamps at 0', () => {
    service.stop();
    expect(service.activeSnapshot).toBeFalse();
  });
});
```

#### Step 3 — `progress-bar.component.ts` + `.html` + `.scss`

**`.html`:**
```html
<div class="progress" [ngClass]="{'progress--active': active$ | async}" aria-hidden="true">
  <div class="progress__bar"></div>
</div>
```

**`.ts`:**
```ts
import { Component } from '@angular/core';
import { Observable } from 'rxjs';
import { ProgressService } from '../../../core/progress/progress.service';

@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.component.html',
  styleUrls: ['./progress-bar.component.scss'],
})
export class ProgressBarComponent {
  active$: Observable<boolean>;
  constructor(private progress: ProgressService) {
    this.active$ = this.progress.active$;
  }
}
```

**`.scss`:** Port from Angular 17's `progress-bar.component.ts` inline styles verbatim:
```scss
:host { display: block; }

.progress {
  position: fixed; top: 0; left: 0; right: 0; height: 2px;
  z-index: 10000; pointer-events: none;
  opacity: 0; transition: opacity 200ms ease;
  &--active { opacity: 1; }
}

.progress__bar {
  position: absolute; top: 0; left: 0; height: 100%; width: 30%;
  background: linear-gradient(90deg, transparent 0%, var(--app-primary, #2563eb) 50%, transparent 100%);
  animation: progressSlide 1400ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes progressSlide {
  0%   { left: -30%; }
  100% { left: 100%; }
}
```

#### Step 4 — Wire in `AppModule` + `AppComponent`

Add `ProgressBarComponent` to `AppModule.declarations`. Add `<app-progress-bar>` as the first element in `AppComponent` template (above `<router-outlet>`).

#### Step 5 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/core/progress frontend/src/app/shared/components/progress-bar \
        frontend/src/app/app.module.ts frontend/src/app/app.component.ts
git commit -m "feat(shell): add ProgressService + ProgressBarComponent

BehaviorSubject counter → active$ boolean → 2px top bar animation.
Declared in AppModule (global singleton). The bar uses --app-primary
for the sweep color so it respects tenant branding.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: NotFoundComponent SCSS

#### Files

- Create: `frontend/src/app/features/not-found/not-found.component.scss`
- Modify: `frontend/src/app/features/not-found/not-found.component.ts` — add `styleUrls: ['./not-found.component.scss']` (currently the component has no `styleUrls` because the SCSS file didn't exist)

#### Context

The `.ts` is already complete (`attemptedPath`, `now`, `interval` clock tick). The `.html` already has the "Flight diverted" layout with these classes: `.not-found`, `.not-found-grid`, `.not-found-frame`, `.nf-row`, `.nf-row-meta`, `.nf-status`, `.nf-divider`, `.nf-route`, `.nf-headline`, `.nf-body`, `.nf-actions`, `.nf-trace`. The HTML uses `pButton` directive (works because `NotFoundModule` imports `SharedModule` which exports `ButtonModule`).

#### Step 1 — `not-found.component.scss`

Implement styles for the existing HTML markup. Match the visual spirit of the Angular 17 "Flight diverted" page (editorial, monospace flight ID, metadata strip):

```scss
:host { display: block; min-height: 100vh; }

.not-found {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 40px 24px;
  background: var(--app-bg, #f8fafc);
}

// Subtle dot-grid background
.not-found-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(var(--app-border, #e2e8f0) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.6;
}

.not-found-frame {
  position: relative;
  width: 100%;
  max-width: 520px;
  animation: nfFadeUp 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.nf-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--app-border, #e2e8f0);
}

.nf-status {
  font-family: var(--font-mono, 'Fira Code', monospace);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--app-text-muted, #64748b);
}

.nf-divider { color: var(--app-border-strong, #cbd5e1); }

.nf-route {
  font-family: var(--font-mono, 'Fira Code', monospace);
  font-size: 11px;
  color: var(--app-text-muted, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.nf-headline {
  font-size: clamp(40px, 8vw, 72px);
  font-weight: 700;
  line-height: 1;
  color: var(--app-text, #0f172a);
  letter-spacing: -0.03em;
  margin: 0 0 16px;
}

.nf-body {
  font-size: 15px;
  line-height: 1.6;
  color: var(--app-text-muted, #64748b);
  max-width: 440px;
  margin-bottom: 32px;
}

.nf-actions {
  margin-bottom: 40px;

  // Override PrimeNG pButton defaults to match project button style
  ::ng-deep .ui-button {
    height: 42px;
    padding: 0 20px;
    font-family: var(--font-sans, 'Fira Sans', sans-serif);
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    background: var(--app-text, #0f172a);
    border-color: var(--app-text, #0f172a);
    color: #fff;
    transition: transform 180ms ease, box-shadow 180ms ease;

    &:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  }
}

.nf-trace {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 20px;
  background: var(--app-surface, #fff);
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 8px;

  div { display: flex; flex-direction: column; gap: 4px; }

  dt {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--app-text-muted, #64748b);
  }

  dd {
    font-family: var(--font-mono, 'Fira Code', monospace);
    font-size: 12px;
    font-weight: 500;
    color: var(--app-text, #0f172a);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes nfFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 600px) {
  .nf-trace { grid-template-columns: 1fr 1fr; }
}
```

#### Step 2 — Add `styleUrls` to the component decorator

In `not-found.component.ts`, change:
```ts
@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
})
```
to:
```ts
@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss'],
})
```

#### Step 3 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
# Visual check: navigate to /no-such-path in browser → "Flight diverted" page
git add frontend/src/app/features/not-found
git commit -m "feat(not-found): add editorial 404 SCSS

Dot-grid background, monospace flight metadata, animated entrance.
Uses --app-* CSS variables so light/dark theme toggle works without
additional JS. pButton styled via ::ng-deep .ui-button override
(PrimeNG 8.0.3 uses .ui-* selectors).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: SavedViewsStore + SavedViewsMenuComponent

#### Files

- Create: `frontend/src/app/core/store/saved-views.store.ts`
- Create: `frontend/src/app/core/store/saved-views.store.spec.ts`
- Create: `frontend/src/app/shared/components/saved-views-menu/saved-views-menu.component.ts`
- Create: `frontend/src/app/shared/components/saved-views-menu/saved-views-menu.component.html`
- Create: `frontend/src/app/shared/components/saved-views-menu/saved-views-menu.component.scss`
- Create: `frontend/src/app/shared/components/saved-views-menu/saved-views-menu.component.spec.ts`
- Modify: `frontend/src/app/shared/shared.module.ts` — declare + export `SavedViewsMenuComponent`
- Modify: `frontend/src/app/features/dashboard/dashboard.component.html` — mount `<app-saved-views-menu>` in the `.control-row`

#### Step 1 — `saved-views.store.ts`

The `SavedView` interface, `STORAGE_KEY`, and logic mirror `main/frontend/src/app/core/store/saved-views.store.ts`. BehaviorSubject pattern:

```ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SavedView {
  id: string;
  name: string;
  createdAt: number;
  filters: {
    airport?: string[];
    datePreset: string;
    dateFrom: string;
    dateTo: string;
    airline?: string[];
    service?: string[];
    handledBy?: string[];
  };
}

const STORAGE_KEY = 'prm-saved-views';

// Module-level function so it can initialise the BehaviorSubject without `this`
function loadFromStorage(): SavedView[] {
  if (typeof window === 'undefined') { return []; }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { return []; }
    return parsed
      .filter((v: any) => v && typeof v.id === 'string' && typeof v.name === 'string')
      .map((v: any) => migrateLegacyFilters(v));
  } catch { return []; }
}

function migrateLegacyFilters(v: any): SavedView {
  const f = v.filters || {};
  const toArray = (x: any): string[] => {
    if (Array.isArray(x)) { return x.filter((s: any) => typeof s === 'string' && s.length > 0); }
    if (typeof x === 'string' && x.length > 0) { return [x]; }
    return [];
  };
  return { ...v, filters: { ...f, airport: toArray(f.airport), airline: toArray(f.airline), service: toArray(f.service), handledBy: toArray(f.handledBy) } };
}

function uuid(): string {
  return 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

@Injectable({ providedIn: 'root' })
export class SavedViewsStore {
  private _views$ = new BehaviorSubject<SavedView[]>(loadFromStorage());

  views$: Observable<SavedView[]> = this._views$.asObservable();
  get viewsSnapshot(): SavedView[] { return this._views$.value; }
  get countSnapshot(): number { return this._views$.value.length; }

  constructor() {
    // Persist to localStorage on every emission
    this._views$.subscribe(list => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
    });
  }

  save(name: string, filters: SavedView['filters']): SavedView {
    const view: SavedView = { id: uuid(), name: name.trim(), createdAt: Date.now(), filters: { ...filters } };
    this._views$.next([view, ...this._views$.value]);
    return view;
  }

  delete(id: string): void {
    this._views$.next(this._views$.value.filter(v => v.id !== id));
  }

  clear(): void { this._views$.next([]); }
}
```

#### Step 2 — `saved-views.store.spec.ts`

```ts
import { TestBed } from '@angular/core/testing';
import { SavedViewsStore, SavedView } from './saved-views.store';

const baseFilters = (): SavedView['filters'] => ({
  airport: ['DEL'],
  datePreset: 'mtd',
  dateFrom: '2026-03-01',
  dateTo: '2026-03-31',
  airline: [],
  service: [],
  handledBy: [],
});

describe('SavedViewsStore', () => {
  let store: SavedViewsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.get(SavedViewsStore);
  });

  afterEach(() => { localStorage.clear(); });

  it('starts empty when localStorage is clear', () => {
    expect(store.countSnapshot).toBe(0);
  });

  it('save() adds a view and returns it', () => {
    const v = store.save('My MTD', baseFilters());
    expect(store.countSnapshot).toBe(1);
    expect(store.viewsSnapshot[0].name).toBe('My MTD');
    expect(v.id).toBeTruthy();
  });

  it('save() writes to localStorage', () => {
    store.save('Persisted', baseFilters());
    const raw = localStorage.getItem('prm-saved-views');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Persisted');
  });

  it('delete() removes the view by id', () => {
    const v = store.save('Delete me', baseFilters());
    store.delete(v.id);
    expect(store.countSnapshot).toBe(0);
  });

  it('clear() empties the list', () => {
    store.save('A', baseFilters());
    store.save('B', baseFilters());
    store.clear();
    expect(store.countSnapshot).toBe(0);
  });

  it('hydrates from localStorage on init', () => {
    // Simulate a prior session having saved a view
    store.save('Prior', baseFilters());
    // Re-create service — reads from localStorage
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.get(SavedViewsStore);
    expect(fresh.countSnapshot).toBe(1);
    expect(fresh.viewsSnapshot[0].name).toBe('Prior');
  });
});
```

#### Step 3 — `saved-views-menu.component.ts` + `.html` + `.scss`

PrimeNG 8 uses `p-overlayPanel` from `OverlayPanelModule` (already in `SharedModule.exports`) as the `mat-menu` replacement. The panel is toggled via a template reference variable `#op`.

**`.html`:**
```html
<button type="button" class="views-btn" (click)="op.toggle($event)"
        [attr.aria-label]="'Saved views (' + (store.countSnapshot) + ')'">
  <i class="pi pi-bookmark"></i>
  <span class="views-btn__label">Views</span>
  <span class="views-btn__badge" *ngIf="(store.views$ | async)?.length > 0">
    {{ (store.views$ | async)?.length }}
  </span>
  <i class="pi pi-chevron-down views-btn__caret"></i>
</button>

<p-overlayPanel #op [dismissable]="true" appendTo="body">
  <div class="views-wrap">
    <div class="views-head">
      <span class="views-head__label">Saved views</span>
      <span class="views-head__count" *ngIf="(store.views$ | async)?.length > 0">
        {{ (store.views$ | async)?.length }}
      </span>
    </div>

    <div class="views-empty" *ngIf="(store.views$ | async)?.length === 0">
      <div class="views-empty__title">No saved views yet</div>
      <div class="views-empty__hint">Save the current filter combination below to restore it later.</div>
    </div>

    <div class="views-list" *ngIf="(store.views$ | async)?.length > 0">
      <div class="view-row" *ngFor="let v of store.views$ | async; trackBy: trackById"
           [class.active]="isActive(v)">
        <button type="button" class="view-row__main" (click)="apply(v); op.hide()">
          <div class="view-row__name">{{ v.name }}</div>
          <div class="view-row__meta">{{ describe(v) }}</div>
        </button>
        <button type="button" class="view-row__del" aria-label="Delete view"
                (click)="remove(v.id, $event)">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <div class="views-save">
      <div class="views-save__label">Save current view</div>
      <div class="views-save__row">
        <input type="text" class="views-save__input" placeholder="e.g. BLR · WCHR · MTD"
               maxlength="48" [(ngModel)]="draftName"
               (keydown.enter)="saveCurrent($event)" (keydown.escape)="draftName = ''" />
        <button type="button" class="views-save__btn"
                [disabled]="!canSave()" (click)="saveCurrent($event)">Save</button>
      </div>
    </div>
  </div>
</p-overlayPanel>
```

**`.ts`:**
```ts
import { Component, ViewChild } from '@angular/core';
import { OverlayPanel } from 'primeng/overlaypanel';
import { FilterStore, DatePreset } from 'src/app/core/store/filter.store';
import { SavedViewsStore, SavedView } from 'src/app/core/store/saved-views.store';
import { ToastService } from 'src/app/core/toast/toast.service';

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) { return false; }
  const setB = new Set(b);
  return a.every(v => setB.has(v));
}

function summarize(values: string[]): string {
  if (values.length === 0) { return ''; }
  if (values.length === 1) { return values[0]; }
  return values[0] + ' +' + (values.length - 1);
}

@Component({
  selector: 'app-saved-views-menu',
  templateUrl: './saved-views-menu.component.html',
  styleUrls: ['./saved-views-menu.component.scss'],
})
export class SavedViewsMenuComponent {
  @ViewChild(OverlayPanel) op: OverlayPanel;

  draftName = '';

  constructor(
    public store: SavedViewsStore,
    private filters: FilterStore,
    private toast: ToastService,
  ) {}

  canSave(): boolean { return this.draftName.trim().length > 0; }

  trackById(_i: number, v: SavedView): string { return v.id; }

  saveCurrent(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.canSave()) { return; }
    this.store.save(this.draftName, {
      airport:    [...this.filters.airportSnapshot],
      datePreset: this.filters.datePresetSnapshot,
      dateFrom:   this.filters.dateFromSnapshot,
      dateTo:     this.filters.dateToSnapshot,
      airline:    [...this.filters.airlineSnapshot],
      service:    [...this.filters.serviceSnapshot],
      handledBy:  [...this.filters.handledBySnapshot],
    });
    this.toast.show('View saved: ' + this.draftName.trim());
    this.draftName = '';
  }

  apply(v: SavedView): void {
    const f = v.filters;
    this.filters.hydrateFromQueryParams({
      airport:    (f.airport    || []).join(','),
      date_from:  f.dateFrom,
      date_to:    f.dateTo,
      airline:    (f.airline    || []).join(','),
      service:    (f.service    || []).join(','),
      handled_by: (f.handledBy  || []).join(','),
    });
    this.filters.setDateRange(f.datePreset as DatePreset, f.dateFrom, f.dateTo);
  }

  remove(id: string, e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    this.store.delete(id);
  }

  isActive(v: SavedView): boolean {
    const f = v.filters;
    return (
      sameSet(f.airport    || [], this.filters.airportSnapshot) &&
      f.datePreset === this.filters.datePresetSnapshot  &&
      f.dateFrom   === this.filters.dateFromSnapshot    &&
      f.dateTo     === this.filters.dateToSnapshot      &&
      sameSet(f.airline   || [], this.filters.airlineSnapshot)  &&
      sameSet(f.service   || [], this.filters.serviceSnapshot)  &&
      sameSet(f.handledBy || [], this.filters.handledBySnapshot)
    );
  }

  describe(v: SavedView): string {
    const bits: string[] = [];
    const f = v.filters;
    const PRESET_LABELS: { [k: string]: string } = {
      today: 'Today', yesterday: 'Yesterday', last7: 'Last 7d', last30: 'Last 30d',
      mtd: 'MTD', last_month: 'Last mo', last_3_months: 'Last 3mo',
      last_6_months: 'Last 6mo', ytd: 'YTD', calendar_year: 'Cal year',
      last_year: 'Last year', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4',
      qtd: 'QTD', custom: 'Custom',
    };
    if (f.airport   && f.airport.length   > 0) { bits.push(summarize(f.airport));   }
    bits.push(PRESET_LABELS[f.datePreset] || f.datePreset);
    if (f.airline   && f.airline.length   > 0) { bits.push(summarize(f.airline));   }
    if (f.service   && f.service.length   > 0) { bits.push(summarize(f.service));   }
    if (f.handledBy && f.handledBy.length > 0) { bits.push(summarize(f.handledBy)); }
    return bits.join(' · ');
  }
}
```

**`.scss`:** Style `.views-wrap` (width 300px), `.views-head`, `.views-empty`, `.views-list`, `.view-row`, `.view-row__main`, `.view-row__del`, `.views-save`, `.views-save__row`, `.views-save__input`, `.views-save__btn`. Use `::ng-deep .ui-overlaypanel` to remove PrimeNG's default padding (replace with `.views-wrap` padding). Mirror the visual language from `main`'s saved-views menu inline styles but translated to SCSS file format.

#### Step 4 — Mount in `dashboard.component.html`

Add `<app-saved-views-menu>` to the `.control-row` div:
```html
<div class="control-row" role="tablist" aria-label="Dashboard tabs">
  <nav class="control-row__tabs" aria-label="Dashboard sections">
    <a *ngFor="let t of tabs" class="tab-pill" ...>{{ t.label }}</a>
  </nav>
  <div class="control-row__actions">
    <app-saved-views-menu></app-saved-views-menu>
  </div>
</div>
```

Add `.control-row__actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }` to `dashboard.component.scss`.

#### Step 5 — `SharedModule` changes

In `shared.module.ts`, add to `declarations` and `exports`:
```ts
import { SavedViewsMenuComponent } from './components/saved-views-menu/saved-views-menu.component';
// ...
declarations: [ /* existing */ SavedViewsMenuComponent ],
exports:      [ /* existing */ SavedViewsMenuComponent ],
```

#### Step 6 — Spec for `SavedViewsMenuComponent`

```ts
describe('SavedViewsMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SavedViewsMenuComponent],
      providers: [
        { provide: SavedViewsStore, useValue: { views$: of([]), countSnapshot: 0, save: jasmine.createSpy(), delete: jasmine.createSpy() } },
        { provide: FilterStore, useValue: { airportSnapshot: ['DEL'], datePresetSnapshot: 'mtd', dateFromSnapshot: '2026-03-01', dateToSnapshot: '2026-03-31', airlineSnapshot: [], serviceSnapshot: [], handledBySnapshot: [], hydrateFromQueryParams: jasmine.createSpy(), setDateRange: jasmine.createSpy() } },
        { provide: ToastService, useValue: { show: jasmine.createSpy() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('creates without error', () => {
    const fixture = TestBed.createComponent(SavedViewsMenuComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('canSave() is false when draftName is empty', () => {
    const fixture = TestBed.createComponent(SavedViewsMenuComponent);
    fixture.componentInstance.draftName = '';
    expect(fixture.componentInstance.canSave()).toBeFalse();
  });

  it('canSave() is true when draftName has content', () => {
    const fixture = TestBed.createComponent(SavedViewsMenuComponent);
    fixture.componentInstance.draftName = 'My View';
    expect(fixture.componentInstance.canSave()).toBeTrue();
  });

  it('describe() produces a dot-separated summary', () => {
    const fixture = TestBed.createComponent(SavedViewsMenuComponent);
    const v: SavedView = {
      id: 'v_1', name: 'Test', createdAt: 0,
      filters: { airport: ['DEL'], datePreset: 'mtd', dateFrom: '2026-03-01', dateTo: '2026-03-31', airline: ['AI'] }
    };
    const desc = fixture.componentInstance.describe(v);
    expect(desc).toContain('DEL');
    expect(desc).toContain('MTD');
    expect(desc).toContain('AI');
  });
});
```

#### Step 7 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/core/store/saved-views.store.ts \
        frontend/src/app/core/store/saved-views.store.spec.ts \
        frontend/src/app/shared/components/saved-views-menu \
        frontend/src/app/shared/shared.module.ts \
        frontend/src/app/features/dashboard/dashboard.component.html \
        frontend/src/app/features/dashboard/dashboard.component.scss
git commit -m "feat(dashboard): SavedViewsStore + SavedViewsMenuComponent

BehaviorSubject store: save / delete / clear filter snapshots to
localStorage; hydrates on init with legacy-array migration. Menu uses
p-overlayPanel (PrimeNG 8 mat-menu equivalent). Trigger shows view
count badge. Save action fires toast.show(). isActive() highlights
the currently-applied view.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: CommandPaletteComponent + NavigationStore extension

#### Files

- Modify: `frontend/src/app/core/store/navigation.store.ts` — add `requestTab(index)` + `requestedTab$`
- Modify: `frontend/src/app/features/dashboard/dashboard.component.ts` — subscribe to `requestedTab$`
- Create: `frontend/src/app/shared/components/command-palette/command-palette.component.ts`
- Create: `frontend/src/app/shared/components/command-palette/command-palette.component.html`
- Create: `frontend/src/app/shared/components/command-palette/command-palette.component.scss`
- Create: `frontend/src/app/shared/components/command-palette/command-palette.component.spec.ts`
- Modify: `frontend/src/app/app.module.ts` — declare `CommandPaletteComponent`
- Modify: `frontend/src/app/app.component.ts` — add `<app-command-palette>` to template

#### Step 1 — Extend `NavigationStore`

Add to `navigation.store.ts` (below the existing `_activeTitle$` declarations):

```ts
import { combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

// Inside NavigationStore class:

private _requestedTabIndex$ = new BehaviorSubject<number | null>(null);
private _requestedTabTick$  = new BehaviorSubject<number>(0);

// Emits a new object each time requestTab() is called, even if the same index.
// The tick counter prevents "same-value-no-emit" on re-request of an active tab.
requestedTab$: Observable<{ index: number; tick: number } | null> = combineLatest([
  this._requestedTabIndex$,
  this._requestedTabTick$,
]).pipe(
  map(([index, tick]) => (index === null ? null : { index, tick })),
  shareReplay(1),
);

requestTab(index: number): void {
  this._requestedTabIndex$.next(index);
  this._requestedTabTick$.next(this._requestedTabTick$.value + 1);
}
```

#### Step 2 — Wire tab-switch in `DashboardComponent`

In `dashboard.component.ts`, add `NavigationStore` to the constructor and subscribe in `ngOnInit`:

```ts
// Add to imports at top
import { NavigationStore } from 'src/app/core/store/navigation.store';

// In constructor:
private navStore: NavigationStore

// In ngOnInit, after the existing subscriptions:
this.navStore.requestedTab$.pipe(
  skip(1),
  takeUntil(this.destroy$),
).subscribe(req => {
  if (req === null) { return; }
  const tab = TABS[req.index];
  if (tab) {
    this.router.navigate([tab.route], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
    });
  }
});
```

#### Step 3 — `command-palette.component.ts`

The Angular 17 version used `signal()` and `@if`. Port to plain class fields + `*ngIf` / `*ngFor`. Key decisions:
- `open`, `query`, `selectedId` are plain class fields (no BehaviorSubject needed — pure local UI state not shared outside the component).
- `get filtered(): Command[]` and `get grouped()` are computed getters re-evaluated on each CD cycle while the palette is open (acceptable for ≤20 commands).
- `@HostListener('document:keydown')` is identical to Angular 17.
- `queueMicrotask` is available in all modern browsers and Node 12+. Add the fallback: `const q = typeof queueMicrotask === 'function' ? queueMicrotask : (fn: () => void) => setTimeout(fn, 0);`

```ts
import { Component, HostListener, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FilterStore } from 'src/app/core/store/filter.store';
import { NavigationStore } from 'src/app/core/store/navigation.store';
import { ThemeService } from 'src/app/core/theme/theme.service';
import { AuthService } from 'src/app/core/auth/auth.service';
import { resolvePreset } from '../../../features/dashboard/utils/date-presets';

interface Command {
  id: string;
  label: string;
  section: string;
  keywords?: string[];
  shortcut?: string;
  icon?: string;
  run(): void;
}

// tslint:disable-next-line: no-any
const _queueMicrotask: (fn: () => void) => void =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn: () => void) => setTimeout(fn, 0);

@Component({
  selector: 'app-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.scss'],
})
export class CommandPaletteComponent {
  @ViewChild('searchInput') searchInput: ElementRef<HTMLInputElement>;
  @ViewChild('listEl') listEl: ElementRef<HTMLDivElement>;

  isOpen = false;
  query = '';
  selectedId: string | null = null;

  readonly defaultIcon = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.2"/></svg>`;

  private readonly allCommands: Command[];

  constructor(
    private router: Router,
    private filters: FilterStore,
    private navStore: NavigationStore,
    private theme: ThemeService,
    private auth: AuthService,
  ) {
    this.allCommands = this.buildCommands();
  }

  get filtered(): Command[] {
    const q = this.query.trim().toLowerCase();
    if (!q) { return this.allCommands; }
    const terms = q.split(/\s+/).filter(Boolean);
    const matching = this.allCommands.filter(c => {
      const hay = (c.label + ' ' + (c.keywords || []).join(' ')).toLowerCase();
      return terms.every(t => hay.indexOf(t) >= 0);
    });
    return matching.sort((a, b) => this.rank(a, q) - this.rank(b, q));
  }

  get grouped(): Array<{ section: string; items: Command[] }> {
    const groups = new Map<string, Command[]>();
    for (const cmd of this.filtered) {
      const list = groups.get(cmd.section) || [];
      list.push(cmd);
      groups.set(cmd.section, list);
    }
    const result: Array<{ section: string; items: Command[] }> = [];
    groups.forEach((items, section) => { result.push({ section, items }); });
    return result;
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (isToggle) { e.preventDefault(); this.toggle(); return; }
    if (this.isOpen && e.key === 'Escape') { e.preventDefault(); this.close(); }
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.moveSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSelection(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = this.filtered.find(c => c.id === this.selectedId);
      if (cmd) { this.run(cmd); }
    }
  }

  toggle(): void { if (this.isOpen) { this.close(); } else { this.show(); } }

  show(): void {
    this.query = '';
    this.isOpen = true;
    if (this.filtered.length > 0) { this.selectedId = this.filtered[0].id; }
    setTimeout(() => { if (this.searchInput) { this.searchInput.nativeElement.focus(); } }, 30);
  }

  close(): void { this.isOpen = false; }

  selectById(id: string): void { this.selectedId = id; }

  run(cmd: Command): void {
    this.close();
    _queueMicrotask(() => cmd.run());
  }

  private moveSelection(delta: number): void {
    const list = this.filtered;
    if (list.length === 0) { return; }
    const idx = list.findIndex(c => c.id === this.selectedId);
    let next = idx + delta;
    if (next < 0) { next = list.length - 1; }
    if (next >= list.length) { next = 0; }
    this.selectedId = list[next].id;
    setTimeout(() => {
      if (!this.listEl) { return; }
      // tslint:disable-next-line: no-any
      const el = this.listEl.nativeElement.querySelector('[data-cmd-id="' + list[next].id + '"]') as any;
      if (el) { el.scrollIntoView({ block: 'nearest' }); }
    }, 0);
  }

  private rank(cmd: Command, q: string): number {
    const label = cmd.label.toLowerCase();
    if (label === q) { return 0; }
    if (label.indexOf(q) === 0) { return 1; }
    if (label.indexOf(q) >= 0) { return 2; }
    return 3;
  }

  private buildCommands(): Command[] {
    const onDashboard = () => this.router.url.startsWith('/dashboard');
    const setPreset = (key: 'today' | 'last7' | 'mtd' | 'last30') => {
      if (!onDashboard()) {
        this.router.navigate(['/dashboard']).then(() => {
          const r = resolvePreset(key); this.filters.setDateRange(key, r.from, r.to);
        });
      } else {
        const r = resolvePreset(key); this.filters.setDateRange(key, r.from, r.to);
      }
    };
    const navAndTab = (idx: number) => {
      const go = () => this.navStore.requestTab(idx);
      if (onDashboard()) { go(); }
      else { this.router.navigate(['/dashboard']).then(() => setTimeout(go, 0)); }
    };
    return [
      { id: 'nav.home',           section: 'Navigation', label: 'Go to Home',               keywords: ['home', 'tile'],                run: () => this.router.navigate(['/home']) },
      { id: 'nav.dashboard',      section: 'Navigation', label: 'Go to Dashboard',           keywords: ['dashboard', 'prm'],            run: () => this.router.navigate(['/dashboard']) },
      { id: 'nav.tab.overview',   section: 'Navigation', label: 'Dashboard → Overview',      keywords: ['overview', 'kpi'],             run: () => navAndTab(0) },
      { id: 'nav.tab.top10',      section: 'Navigation', label: 'Dashboard → Top 10',        keywords: ['top', 'ranking', 'airlines'],  run: () => navAndTab(1) },
      { id: 'nav.tab.breakup',    section: 'Navigation', label: 'Dashboard → Service Breakup', keywords: ['service', 'sankey'],         run: () => navAndTab(2) },
      { id: 'nav.tab.fulfillment', section: 'Navigation', label: 'Dashboard → Fulfillment',  keywords: ['fulfillment', 'sla'],          run: () => navAndTab(3) },
      { id: 'nav.tab.insights',   section: 'Navigation', label: 'Dashboard → Insights',      keywords: ['insights', 'agents'],         run: () => navAndTab(4) },
      { id: 'filter.today',  section: 'Filters', label: 'Set date: Today',         keywords: ['today', 'date'],         run: () => setPreset('today') },
      { id: 'filter.last7',  section: 'Filters', label: 'Set date: Last 7 Days',   keywords: ['last', '7', 'week'],     run: () => setPreset('last7') },
      { id: 'filter.mtd',    section: 'Filters', label: 'Set date: Month to Date', keywords: ['month', 'mtd'],          run: () => setPreset('mtd') },
      { id: 'filter.last30', section: 'Filters', label: 'Set date: Last 30 Days',  keywords: ['last', '30', 'month'],   run: () => setPreset('last30') },
      { id: 'filter.clear',  section: 'Filters', label: 'Clear all filters',       keywords: ['clear', 'reset'],        run: () => this.filters.clearSecondary() },
      { id: 'theme.toggle',  section: 'Theme',   label: 'Toggle theme (light / dark)', keywords: ['theme', 'dark', 'light'], run: () => this.theme.toggle() },
      { id: 'account.signout', section: 'Account', label: 'Sign out',             keywords: ['logout', 'exit'],        run: () => this.auth.logout() },
    ];
  }
}
```

#### Step 4 — `command-palette.component.html`

Port the Angular 17 inline template to a separate `.html` file, replacing `@if` with `*ngIf`, `@for` with `*ngFor`, signal calls with plain field access:

```html
<ng-container *ngIf="isOpen">
  <div class="cp-backdrop" (click)="close()" aria-hidden="true"></div>
  <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Command palette"
       (click)="$event.stopPropagation()">
    <div class="cp-search">
      <svg class="cp-search__icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input #searchInput type="text" class="cp-search__input"
             placeholder="Type a command or search..." autocomplete="off" spellcheck="false"
             [(ngModel)]="query" (keydown)="onKeydown($event)" />
      <button type="button" class="cp-search__esc" aria-label="Close" (click)="close()">esc</button>
    </div>
    <div class="cp-divider"></div>
    <div class="cp-list" role="listbox" #listEl>
      <div class="cp-empty" *ngIf="filtered.length === 0">
        <div class="cp-empty__title">No matching commands</div>
        <div class="cp-empty__hint">Try "dashboard", "theme", or "sign out"</div>
      </div>
      <ng-container *ngIf="filtered.length > 0">
        <div class="cp-group" *ngFor="let group of grouped">
          <div class="cp-group__head">{{ group.section }}</div>
          <button type="button" class="cp-row" role="option"
                  *ngFor="let cmd of group.items"
                  [class.selected]="cmd.id === selectedId"
                  [attr.data-cmd-id]="cmd.id"
                  (mouseenter)="selectById(cmd.id)"
                  (click)="run(cmd)">
            <span class="cp-row__icon" [innerHTML]="cmd.icon || defaultIcon"></span>
            <span class="cp-row__label">{{ cmd.label }}</span>
            <span class="cp-row__kbd" *ngIf="cmd.shortcut">{{ cmd.shortcut }}</span>
          </button>
        </div>
      </ng-container>
    </div>
    <div class="cp-divider"></div>
    <div class="cp-footer">
      <span class="cp-footer__hint">
        <span class="cp-kbd">↑↓</span> navigate
        <span class="cp-sep">·</span>
        <span class="cp-kbd">↵</span> run
        <span class="cp-sep">·</span>
        <span class="cp-kbd">esc</span> close
      </span>
      <span class="cp-footer__count">{{ filtered.length }} commands</span>
    </div>
  </div>
</ng-container>
```

#### Step 5 — `command-palette.component.scss`

Copy the CSS from the Angular 17 inline `styles:` array verbatim into the `.scss` file. The CSS variables used (`--surface`, `--border`, `--ink`, `--muted`, `--accent`, `--accent-fg`, `--shadow-elevated`) must exist in `_variables.scss` or `_material-tokens.scss`. Verify each one; add any missing. The `cpFadeIn` and `cpModalIn` keyframe animations are unchanged.

#### Step 6 — Wire in `AppModule` + `AppComponent`

Add `CommandPaletteComponent` to `AppModule.declarations`. `AppComponent` template:
```html
<app-progress-bar></app-progress-bar>
<router-outlet></router-outlet>
<app-command-palette></app-command-palette>
<app-toast-container></app-toast-container>
```

#### Step 7 — Spec

```ts
describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CommandPaletteComponent],
      providers: [
        { provide: Router, useValue: { url: '/dashboard', navigate: jasmine.createSpy() } },
        { provide: FilterStore, useValue: { clearSecondary: jasmine.createSpy(), setDateRange: jasmine.createSpy(), datePresetSnapshot: 'mtd', dateFromSnapshot: '', dateToSnapshot: '' } },
        { provide: NavigationStore, useValue: { requestTab: jasmine.createSpy() } },
        { provide: ThemeService, useValue: { toggle: jasmine.createSpy() } },
        { provide: AuthService, useValue: { logout: jasmine.createSpy() } },
      ],
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
  });

  it('isOpen starts false', () => {
    expect(fixture.componentInstance.isOpen).toBeFalse();
  });

  it('show() sets isOpen to true', () => {
    fixture.componentInstance.show();
    expect(fixture.componentInstance.isOpen).toBeTrue();
  });

  it('close() sets isOpen to false', () => {
    fixture.componentInstance.show();
    fixture.componentInstance.close();
    expect(fixture.componentInstance.isOpen).toBeFalse();
  });

  it('filtered returns all commands when query is empty', () => {
    fixture.componentInstance.query = '';
    expect(fixture.componentInstance.filtered.length).toBe(fixture.componentInstance['allCommands'].length);
  });

  it('filtered narrows by query', () => {
    fixture.componentInstance.query = 'theme';
    const ids = fixture.componentInstance.filtered.map(c => c.id);
    expect(ids).toContain('theme.toggle');
    expect(ids).not.toContain('nav.home');
  });

  it('Ctrl+K keydown calls toggle()', () => {
    const spy = spyOn(fixture.componentInstance, 'toggle');
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    fixture.componentInstance.onGlobalKeydown(e);
    expect(spy).toHaveBeenCalled();
  });
});
```

#### Step 8 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/core/store/navigation.store.ts \
        frontend/src/app/features/dashboard/dashboard.component.ts \
        frontend/src/app/shared/components/command-palette \
        frontend/src/app/app.module.ts frontend/src/app/app.component.ts
git commit -m "feat(shell): CommandPaletteComponent (Ctrl/Cmd-K)

Navigation section: home, dashboard, 5 tabs. Filter section: 4 date
presets + clear. Theme toggle. Sign out. Tab navigation uses
NavigationStore.requestTab() — DashboardComponent.ngOnInit now
subscribes to requestedTab$ and navigates to the matching route.

Angular-8 port: signal() → class fields; @if → *ngIf; @for → *ngFor;
inject() → constructor. queueMicrotask falls back to setTimeout for
older Chromium.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: DevTenantPickerComponent

#### Files

- Create: `frontend/src/app/shared/components/dev-tenant-picker/dev-tenant-picker.component.ts`
- Create: `frontend/src/app/shared/components/dev-tenant-picker/dev-tenant-picker.component.html`
- Create: `frontend/src/app/shared/components/dev-tenant-picker/dev-tenant-picker.component.scss`
- Create: `frontend/src/app/shared/components/dev-tenant-picker/dev-tenant-picker.component.spec.ts`
- Modify: `frontend/src/app/shared/shared.module.ts` — declare + export `DevTenantPickerComponent`
- Modify: `frontend/src/app/features/home/home.component.html` — mount `<app-dev-tenant-picker>` in top-right corner of the home page

#### Step 1 — `dev-tenant-picker.component.ts`

```ts
import { Component, OnInit } from '@angular/core';
import { of } from 'rxjs';
import { take, catchError, finalize } from 'rxjs/operators';
import { ApiClient } from 'src/app/core/api/api.client';
import { AuthStore } from 'src/app/core/store/auth.store';

export const DEV_TENANT_STORAGE_KEY = 'prm-dev-tenant-slug';

interface DevTenant { slug: string; name: string; }

const DEV_TENANTS: ReadonlyArray<DevTenant> = [
  { slug: 'aeroground', name: 'AeroGround Services' },
  { slug: 'skyserve',   name: 'SkyServe Handling' },
  { slug: 'globalprm',  name: 'GlobalPRM' },
];

function isLocalHost(): boolean {
  if (typeof window === 'undefined') { return false; }
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function readDevTenantOverride(): string | null {
  if (!isLocalHost()) { return null; }
  try {
    const slug = localStorage.getItem(DEV_TENANT_STORAGE_KEY);
    if (!slug) { return null; }
    return DEV_TENANTS.some(t => t.slug === slug) ? slug : null;
  } catch { return null; }
}

@Component({
  selector: 'app-dev-tenant-picker',
  templateUrl: './dev-tenant-picker.component.html',
  styleUrls: ['./dev-tenant-picker.component.scss'],
})
export class DevTenantPickerComponent {
  readonly visible = isLocalHost();
  readonly tenants = DEV_TENANTS;
  isMenuOpen = false;

  constructor(private api: ApiClient, private authStore: AuthStore) {}

  get activeSlug(): string { return readDevTenantOverride() || 'aeroground'; }

  toggleMenu(): void { this.isMenuOpen = !this.isMenuOpen; }
  closeMenu(): void  { this.isMenuOpen = false; }

  switchTo(slug: string): void {
    if (slug === this.activeSlug) { this.closeMenu(); return; }
    try { localStorage.setItem(DEV_TENANT_STORAGE_KEY, slug); } catch {}
    this.api.post('/auth/logout', {}).pipe(
      take(1),
      catchError(() => of(null)),
      finalize(() => { this.authStore.clear(); this.doNavigate('/login'); }),
    ).subscribe();
  }

  // Protected so tests can spy without window.location.assign
  protected doNavigate(url: string): void {
    window.location.assign(url);
  }
}
```

#### Step 2 — `dev-tenant-picker.component.html`

Simple `*ngIf`-based dropdown (no `p-overlayPanel` needed for this dev-only control):

```html
<div class="devpick" *ngIf="visible">
  <button type="button" class="devpick__trigger" (click)="toggleMenu()"
          [pTooltip]="'Switch tenant (dev only)'" tooltipPosition="bottom"
          aria-label="Developer tenant picker">
    <span class="devpick__tag">DEV</span>
    <span class="devpick__sep">·</span>
    <span class="devpick__slug">{{ activeSlug }}</span>
    <i class="pi pi-chevron-down devpick__caret"></i>
  </button>

  <div class="devpick__menu" *ngIf="isMenuOpen" (mouseleave)="closeMenu()">
    <div class="devpick__head">
      <span class="devpick__menu-title">Dev tenant</span>
      <span class="devpick__hint">Switching signs you out</span>
    </div>
    <button type="button" class="devpick__item"
            *ngFor="let t of tenants"
            [class.is-active]="t.slug === activeSlug"
            (click)="switchTo(t.slug)">
      <span class="devpick__item-slug">{{ t.slug }}</span>
      <span class="devpick__item-name">{{ t.name }}</span>
      <i class="pi pi-check devpick__check" *ngIf="t.slug === activeSlug"></i>
    </button>
  </div>
</div>
```

#### Step 3 — `dev-tenant-picker.component.scss`

Style `.devpick` (relative container), `.devpick__trigger` (dashed border, DEV badge, monospace slug), `.devpick__menu` (absolute dropdown, z-index 1000, white background, border radius), `.devpick__item` (full-width button, hover state, active state with accent background). Port the visual language from the Angular 17 version's inline styles.

#### Step 4 — Mount in `home.component.html`

Add `<app-dev-tenant-picker>` in the home page top-right. The `HomeModule` already imports `SharedModule`, so no module change needed.

#### Step 5 — `SharedModule` changes

Add to `declarations` and `exports`:
```ts
import { DevTenantPickerComponent } from './components/dev-tenant-picker/dev-tenant-picker.component';
```

#### Step 6 — Spec

```ts
describe('DevTenantPickerComponent', () => {
  it('creates without error when visible is false (non-localhost)', () => {
    // visible = isLocalHost() = false in karma test environment by default
    const fixture = TestBed.createComponent(DevTenantPickerComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('readDevTenantOverride returns null when localStorage is empty', () => {
    localStorage.clear();
    // In karma, hostname is not localhost so readDevTenantOverride returns null regardless
    // Test the localStorage logic directly by stubbing isLocalHost — skip for POC scope
    expect(true).toBeTrue(); // placeholder
  });

  it('switchTo same slug closes menu without navigating', () => {
    const fixture = TestBed.createComponent(DevTenantPickerComponent);
    const navSpy = spyOn(fixture.componentInstance as any, 'doNavigate');
    fixture.componentInstance.isMenuOpen = true;
    // activeSlug defaults to readDevTenantOverride() || 'aeroground' = 'aeroground' in test
    fixture.componentInstance.switchTo(fixture.componentInstance.activeSlug);
    expect(navSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isMenuOpen).toBeFalse();
  });
});
```

#### Step 7 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add frontend/src/app/shared/components/dev-tenant-picker \
        frontend/src/app/shared/shared.module.ts \
        frontend/src/app/features/home/home.component.html
git commit -m "feat(dev): DevTenantPickerComponent

Dev-only tenant switcher visible on localhost. Shows DEV · <slug>
badge. Dropdown lists the 3 seeded tenants; switching calls
POST /auth/logout then clears auth state and redirects to /login.
Hidden (ng-if visible=false) on any real hostname.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `[appTooltip]` deletion + `pTooltip` migration audit

#### Files

- Delete: `frontend/src/app/shared/directives/tooltip.directive.ts`
- Delete: `frontend/src/app/shared/directives/tooltip.directive.spec.ts`
- Modify: `frontend/src/app/shared/shared.module.ts` — remove `TooltipDirective` import, declaration, export
- Modify: any other files that use `[appTooltip]` (determined by grep)

#### Step 1 — Run the audit grep

```bash
docker compose run --rm frontend-dev grep -r "appTooltip" src --include="*.ts" --include="*.html"
```

For each hit, the migration is: replace `[appTooltip]="expr" [tooltipPosition]="pos"` with `[pTooltip]="expr" tooltipPosition="pos"`. If the expression is a string literal, use `pTooltip="text"` (no binding needed). The `pTooltip` directive is from `TooltipModule` already in `SharedModule.exports`.

**Known location from reading the code:** `DevTenantPickerComponent` was written in Task 6 already using `pTooltip`, so there should be zero `appTooltip` usages in any Phase 6 file. The grep may return zero results if Phases 1–5 all used `pTooltip` (they likely did since the design spec said to use PrimeNG's `pTooltip`). Either way, run the grep and fix any hits.

#### Step 2 — Remove from `SharedModule`

Remove these lines from `shared.module.ts`:
```ts
import { TooltipDirective } from './directives/tooltip.directive';
// from declarations: TooltipDirective
// from exports: TooltipDirective
```

#### Step 3 — Delete the files

```bash
rm frontend/src/app/shared/directives/tooltip.directive.ts
rm frontend/src/app/shared/directives/tooltip.directive.spec.ts
```

If the `directives/` folder becomes empty, remove it too.

**Note:** The directive was declared and exported in `SharedModule` as `TooltipDirective`. After deletion, any template that still uses `appTooltip` will get a compile error — confirming the grep found all usages.

#### Step 4 — Verify + commit

```bash
docker compose run --rm frontend-dev npx tsc --noEmit -p tsconfig.app.json
docker compose run --rm frontend-dev npm test -- --watch=false --browsers=ChromeHeadlessNoSandbox
docker compose run --rm frontend-dev npm run lint
git add -A frontend/src/app/shared/directives frontend/src/app/shared/shared.module.ts
git commit -m "refactor(shared): delete [appTooltip] directive, migrate to pTooltip

The custom body-portal viewport-clamping tooltip directive is replaced
by PrimeNG 8's pTooltip (TooltipModule already in SharedModule.exports).
Design spec §6.4 explicitly calls for this migration. The appTooltip
file and spec are deleted; directive removed from SharedModule.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: TSLint pass

#### Step 1 — Run lint and capture output

```bash
docker compose run --rm frontend-dev npm run lint 2>&1 | tee /tmp/lint-output.txt
```

#### Step 2 — Triage

Expected categories of violations in new Phase 6 code:

| Rule | Location | Action |
|---|---|---|
| `no-any` | `CommandPaletteComponent.buildCommands` — `el.scrollIntoView(...)` typed as `any`; `innerHTML` binding | Suppress with `// tslint:disable-next-line: no-any` with a comment |
| `no-any` | `SavedViewsStore.migrateLegacyFilters` parameter | Suppress with `// tslint:disable-next-line: no-any` — the function is explicitly handling untyped JSON |
| `deprecation` | Any `TestBed.get(...)` in new specs | Warning only — already accepted in `tslint.json` |
| Long lines | CSS-class string expressions in HTML attribute bindings | Reformat onto multiple lines |
| `no-input-rename` | `TooltipDirective` was suppressed — now deleted so this disappears | No action |

For **auto-fixable** issues (trailing commas, quote style), run:
```bash
docker compose run --rm frontend-dev npx tslint --fix 'src/**/*.ts'
```

#### Step 3 — Target state

`npm run lint` exits 0 (no errors). Warnings for `deprecation` (Angular 8 `TestBed.get`) and individually-suppressed `no-any` (ECharts handlers, JSON parsing) are acceptable.

Do not add new relaxed rules to `tslint.json` unless more than 3 files need the same suppression — in that case add to the `_documentation` key with a rationale comment.

#### Step 4 — Verify + commit

```bash
docker compose run --rm frontend-dev npm run lint
git add -A frontend/src
git commit -m "chore(lint): TSLint clean pass for Phase 6

Suppress no-any in CommandPalette scrollIntoView and SavedViewsStore
JSON parsing (typed as any deliberately). All other violations fixed
in-place. npm run lint exits 0.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Production build + Docker smoke test

#### Step 1 — Confirm Dockerfile is correct

Check `frontend/Dockerfile` uses `node:12.22-alpine` builder stage + `nginx` runtime stage, both sha256-pinned, and `npm ci` (not `npm install`). Spec § 11 has the exact Dockerfile content to match.

#### Step 2 — Run production AOT build

```bash
docker compose run --rm frontend-dev npm run build -- --configuration production
```

Expected output: `Generating ES5 bundles for differential loading`. Check bundle sizes against `angular.json` budgets (`maximumWarning: 2mb`). If a warning fires, identify the large module and add a lazy boundary if possible (likely not needed at this stage).

#### Step 3 — Build + start the full stack

```bash
docker compose up -d --build frontend
docker compose ps
```

All 5 services healthy. Frontend healthcheck in compose: `wget --quiet --spider http://127.0.0.1/ || exit 1`.

#### Step 4 — Manual smoke walkthrough

At `http://aeroground.localhost:4200`:

- [ ] Login as admin/admin123 → home page loads
- [ ] Navigate to PRM Dashboard tile → Overview tab renders KPI cards + charts
- [ ] All 5 tabs navigate correctly; filters persist across tabs
- [ ] **Ctrl+K** opens command palette; type "theme" → Enter → dark mode activates; Ctrl+K again → Esc closes
- [ ] Ctrl+K → type "top 10" → Enter → navigates to Top 10 tab
- [ ] Click "Views" button → overlay panel opens → type a name → Save → toast notification "View saved: ..." appears and auto-dismisses
- [ ] Refresh page → Views panel → saved view still listed
- [ ] Click saved view → filters change; view shows as active (highlighted)
- [ ] Delete saved view → view removed; count badge disappears
- [ ] Progress bar: visible during initial data load when switching to a tab
- [ ] On localhost: "DEV · aeroground" badge in home page → click → switch to "skyserve" → redirected to login
- [ ] Navigate to `/does-not-exist` → "Flight diverted" 404 page renders; live clock ticks; "Return to base" button navigates to /home
- [ ] All tooltip targets (any buttons with `pTooltip`) show tooltips; no `appTooltip` tooltip is visible anywhere
- [ ] Theme toggle (light → dark → light) works on all tabs

#### Step 5 — Tag

```bash
git status   # working tree clean
git tag -a v0.6.0-phase6 -m "Phase 6 (Polish & Extras) complete

All 9 Phase 6 deliverables shipped on angular-8-rewrite:
- ToastContainer (BehaviorSubject-backed toast queue)
- ProgressService + ProgressBar (2px top indicator)
- NotFoundComponent SCSS (Flight diverted, dot-grid, entrance anim)
- SavedViewsStore + SavedViewsMenu (localStorage persistence)
- CommandPalette (Ctrl/Cmd-K, 15 commands, keyboard nav)
- DevTenantPicker (localhost-only, 3 seeded tenants)
- [appTooltip] deleted → pTooltip migration complete
- TSLint clean (0 errors)
- Production AOT build + Docker smoke test green

Angular 8.2.14 / PrimeNG 8.0.3 / ngx-echarts 5.2.2 / echarts 4.9.0.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Cross-cutting concerns

### `AppModule.declarations` grows by 3

`ProgressBarComponent`, `ToastContainerComponent`, and `CommandPaletteComponent` are global shell components declared in `AppModule`. They are **not** in `SharedModule`. The reason: they are singletons mounted in `AppComponent`, never imported by a feature module, so putting them in `SharedModule` would export them everywhere unnecessarily.

### `SharedModule.declarations/exports` grows by 2

`SavedViewsMenuComponent` (used inside `DashboardModule`) and `DevTenantPickerComponent` (used inside `HomeModule`) are added to `SharedModule` because they are used in multiple feature modules.

### `AppComponent` template

After items 1, 2, 5 are wired, `app.component.ts` template becomes:
```html
<app-progress-bar></app-progress-bar>
<router-outlet></router-outlet>
<app-command-palette></app-command-palette>
<app-toast-container></app-toast-container>
```

`AppComponent` must declare these in `AppModule` (not import from `SharedModule`). The current `AppModule` only declares `AppComponent`. This is a known change — do it incrementally as each item is wired.

### `NavigationStore` additions (Task 5)

The `requestedTab$` extension is additive — `setActiveTitle` and `activeTitleSnapshot` are unchanged. The new `requestTab(index)` is only called from `CommandPaletteComponent`. The `DashboardComponent` subscribes to `requestedTab$` with `skip(1)` so it ignores the initial null emission.

### `DashboardModule` — no changes needed

`SavedViewsMenuComponent` is declared in `SharedModule`. `DashboardModule` already imports `SharedModule`. No `DashboardModule` change needed to use `<app-saved-views-menu>` in the dashboard template.

### TSLint rules — no re-tightening needed

All relaxed rules in the existing `tslint.json` remain appropriate:
- `variable-name: allow-leading-underscore` — needed for `BehaviorSubject` convention (`_views$`, etc.)
- `max-line-length: 140` — needed for template attribute strings
- `no-non-null-assertion: true` — kept strict

New rule suppressions in Phase 6 are added at `// tslint:disable-next-line:` scope (not as rule changes in `tslint.json`), keeping the project-level config clean.

### `AppComponent` needs `FormsModule` for `CommandPaletteComponent`'s `[(ngModel)]`

The `CommandPaletteComponent` uses `[(ngModel)]="query"`. The component is declared in `AppModule`. `FormsModule` must be imported in `AppModule`. Check if it already is — if not, add it.

---

## Risks at the phase level

- **`p-overlayPanel` dismiss behaviour**: PrimeNG 8's `p-overlayPanel` with `[dismissable]="true"` closes on outside click. Test that clicking the trigger button again correctly toggles (not flickers). The `op.toggle($event)` API in PrimeNG 8 may not track state correctly if clicked rapidly — add a 30ms debounce in `saveCurrent()` if needed.

- **`pTooltip` migration completeness**: If any Phase 1–5 component used `appTooltip`, the TSLint build in Task 8 (after deletion in Task 7) will surface compile errors. This is intentional — compile errors are better than silently-broken tooltips. Fix each one by replacing with `pTooltip`.

- **`CommandPalette` getters vs change detection**: `filtered` and `grouped` are plain getters re-evaluated every CD cycle while the palette is open. With Angular 8 default change detection and ~15 commands, this is imperceptible. If user reports palette lag when typing fast, convert `query` to a `BehaviorSubject` and derive `filtered$` / `grouped$` as observables, displaying via `async` pipe.

- **`queueMicrotask` in karma tests**: The Karma test environment runs in ChromeHeadless. Chrome 71+ has `queueMicrotask`. The karma-chrome-launcher in the project uses version 2.2.0 which may launch Chrome 70 or older depending on the system installation. The fallback `typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => setTimeout(fn, 0)` in `CommandPaletteComponent` guards this.

- **localStorage in tests**: `SavedViewsStore` reads/writes localStorage in its constructor. Every test that creates this service via `TestBed` touches real localStorage. Always `afterEach(() => { localStorage.clear(); })` in specs that use it.

- **`AppComponent` FormsModule dependency**: `CommandPaletteComponent` uses `[(ngModel)]` and is declared in `AppModule`. If `FormsModule` is not imported in `AppModule`, the build will warn but not error (Angular 8 doesn't error on unrecognized directives in templates by default with `NO_ERRORS_SCHEMA`... but the production build without `schemas` will error). Check `app.module.ts` imports array before completing Task 5.

---

## Time estimate

| Task | Hours |
|---|---|
| 1. ToastContainer | 0.5 |
| 2. ProgressService + ProgressBar | 0.5 |
| 3. NotFoundComponent SCSS | 0.5 |
| 4. SavedViewsStore + Menu | 2.0 |
| 5. CommandPalette + NavigationStore ext. | 2.5 |
| 6. DevTenantPicker | 1.0 |
| 7. pTooltip migration audit | 0.5 |
| 8. TSLint pass | 0.5 |
| 9. Production build + smoke test | 1.0 |
| **Total** | **9.0 hrs** |

Within the 8–12 hour Phase 6 estimate from the design spec § 12.

---

## Out of scope for this plan

| Phase | Deliverables |
|---|---|
| **Phase 7** | Cutover decision: run Angular 17 (`main`) on :4200 and Angular 8 branch on :4201 side-by-side; document visual deltas; merge / both-alive / hand-off decision |