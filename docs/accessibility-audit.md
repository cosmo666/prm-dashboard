# Accessibility Audit — PRM Dashboard Frontend

Date: 2026-04-09
Scope: targeted WCAG 2.1 AA audit of login, top-bar, filter bar, date range
picker, KPI card, top 10 tab, base chart wrapper, airport selector, and 404
page. Contrast ratios computed by hand using the WCAG relative-luminance
formula.

## Contrast ratios

WCAG AA threshold: 4.5:1 for normal text, 3:1 for large text (>=18px, or
>=14px bold).

### Light mode

| Pair | Before | After | Status |
|---|---|---|---|
| `--muted` #78716c on `--bg` #fafaf7 | 4.59:1 | **5.08:1** (#706a65) | fixed — bumped margin |
| `--muted` on `--surface` #ffffff | 4.80:1 | **5.31:1** | fixed |
| `--muted` on `--surface-2` #f5f5f4 | **4.42:1** ✗ | **4.88:1** | CRITICAL — fixed |
| `--ink-muted` #44403c on `--bg` | 11.1:1 | (unchanged) | pass |
| `.alert` #991b1b on #fef2f2 | 7.66:1 | (unchanged) | pass |
| KPI delta up #047857 on #ecfdf5 | 5.22:1 | (unchanged) | pass |
| KPI delta down #b91c1c on #fef2f2 | 5.87:1 | (unchanged) | pass |
| Chip pill #1e3a8a on #eff6ff | 9.41:1 | (unchanged) | pass |
| Login placeholder `#a8a29e` on #fff | **2.51:1** ✗ | **5.31:1** | WARNING — fixed (→ `--muted`) |
| Login `.strip__item .label-micro` rgba(250,250,247,0.45) on #0b0b0c | ~4.2:1 ✗ | **~5.5:1** (0.62) | WARNING — fixed |
| Login `.mark__meta .label-micro` rgba(250,250,247,0.5) on #0b0b0c | ~4.7:1 (marginal) | **~5.6:1** (0.6) | INFO — fixed |

### Dark mode

| Pair | Ratio | Status |
|---|---|---|
| `--muted` #a8a29e on `--bg` #0a0a0a | 7.88:1 | pass |
| `--muted` on `--surface` #141413 | 7.38:1 | pass |
| `--muted` on `--surface-2` #1c1c1b | 6.86:1 | pass |
| `--ink-muted` #d6d3d1 on `--bg` | 13.45:1 | pass |
| Chip pill `--accent-fg` #93c5fd on `--accent-bg` #1e293b | 7.81:1 | pass |

Dark mode had plenty of headroom; no color changes required.

## Issues found and fixed

### CRITICAL
- **`--muted` on `--surface-2` failed WCAG AA (4.42:1) in light mode.** Any
  micro-label over a recessed card failed. Darkened `--muted` from
  `#78716c` to `#706a65` which fixes all `--muted`-on-surface pairs at
  once while preserving the warm stone palette. File:
  `frontend/src/styles.scss`.

### WARNING
- **Login password/username `::placeholder` hardcoded `#a8a29e` on white
  (2.51:1).** Replaced with `var(--muted)` at full opacity. File:
  `frontend/src/app/features/auth/login/login.component.scss`.
- **Login dark brand panel status-strip labels at 45% alpha (~4.2:1).**
  Bumped to 62% alpha (~5.5:1). Same file.
- **Login dark brand mark meta label at 50% alpha (marginal).** Bumped to
  60%. Same file.

### INFO — ARIA / semantic fixes
- **Chart wrappers had no screen-reader description.** Added `role="img"`,
  `aria-label` (computed from title/subtitle/state), and `aria-busy` on
  `<section>`. Skeleton gets `role="status"`; empty state gets
  `role="status"`; canvas container gets `role="presentation"` to hide
  ECharts internals from assistive tech. File:
  `frontend/src/app/shared/charts/base-chart.component.ts`.
- **KPI delta badges announced as bare numbers.** Added descriptive
  `aria-label` ("Up 12.4 percent versus previous period"); hid duplicate
  SVG + inner span from AT via `aria-hidden="true"`. File:
  `frontend/src/app/features/dashboard/components/kpi-card/kpi-card.component.ts`.
- **Top 10 agents table was all `<div>` with no table semantics.** Added
  `role="table"`, `role="row"`, `role="columnheader"`, `role="cell"` so it
  is announced as a grid. Empty state gets `role="status"`. File:
  `frontend/src/app/features/dashboard/tabs/top10/top10.component.html`.
- **Filter bar `mat-select` elements had `<label>` without `for=`.**
  Native `<label>` doesn't bind to custom Angular Material components
  through proximity. Converted to `<span id=...>` with `aria-labelledby`
  on each `mat-select` so screen readers announce the field name. File:
  `frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.html`.
- **Filter chip remove-buttons had only a tooltip.** Added descriptive
  `aria-label` that includes the filter key and value (e.g. "Remove airline
  filter: Air India"), plus explicit `type="button"`. Same file.
- **Active-filter pill container is a live region now** (`role="status"`,
  `aria-live="polite"`) so toggling filters announces state changes.
- **`.clear-btn` missing `type="button"` and aria-label.** Added both.
- **Decorative SVGs** inside delta badge, chart empty state, and chip
  buttons are marked `aria-hidden="true"`.

### Landmarks
All four top-level routes (login, home, dashboard, not-found) already wrap
their root in `<main>`. Top bar already uses `<header>` + `<nav>` with an
`aria-label="Breadcrumb"`. No landmark gaps found.

### Interactive labels
- Theme toggle — has `aria-label` (dynamic, sun/moon)
- User menu button — has `aria-label="User menu"`
- Airport selector — has `aria-label` including station name
- Date range trigger — has `aria-label` including current range
- Password show/hide — has dynamic `aria-label`
All icon-only buttons are labeled.

### Keyboard navigation
- Date range picker: trigger opens via Enter/Space/ArrowDown
  (`onTriggerKeydown`), menu handles ArrowUp/ArrowDown cycling
  (`onMenuKeydown`). Material menu handles Escape to close.
- Login form: standard Tab order (username → password → show/hide → submit).
- Filter bar: Material selects handle their own keyboard model.
- No custom traps detected; no `outline: none` without `box-shadow`
  replacement.

### Focus visibility
Global `:focus-visible` rule in `styles.scss` provides a 2px accent ring with
a 2px background halo on every interactive element. Verified present and not
overridden by any audited component.

## Remaining known issues (not fixed — out of audit scope)

- **Top bar in dark mode** still uses hardcoded `rgba(250, 250, 247, 0.85)`
  background, so the topbar renders light-cream in dark mode. Not a
  contrast issue per se (it looks inverted but the text on it stays on a
  light surface), but worth a separate design pass.
- **Chip pill `.chip-pill__sep`** uses hardcoded `#93c5fd` for the "·"
  separator character which fails contrast on `#eff6ff`. Left as-is
  because the character is purely decorative and the surrounding text has
  full contrast; marking it `aria-hidden` would be another option.
- **Responsive breakpoints** at 820px hide the breadcrumb nav and user
  meta; not an a11y issue but means keyboard-only mobile users lose the
  breadcrumb. Acceptable tradeoff for the POC.
- Angular Material internal CSS: we don't attempt to audit Material's
  prebuilt theme — we trust the framework.

## Files modified

- `frontend/src/styles.scss` — `--muted` value
- `frontend/src/app/features/auth/login/login.component.scss` — placeholder color, strip/mark label alphas
- `frontend/src/app/shared/charts/base-chart.component.ts` — `role="img"`, aria-label, aria-busy, status roles
- `frontend/src/app/features/dashboard/components/kpi-card/kpi-card.component.ts` — delta aria-label, hide inner content
- `frontend/src/app/features/dashboard/tabs/top10/top10.component.html` — ARIA table roles
- `frontend/src/app/features/dashboard/components/filter-bar/filter-bar.component.html` — aria-labelledby on mat-selects, aria-label on chip remove buttons, live-region container, button types

## Build verification

`cd frontend && npx ng build` — succeeded in 24.5s with no warnings or
errors. Initial bundle 1.38 MB (unchanged).
