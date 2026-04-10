import { Component, input, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe, TooltipDirective],
  template: `
    <article class="kpi" [class.kpi--loading]="loading()"
             [appTooltip]="tooltip()" [tooltipPosition]="'bottom'">
      <header class="kpi__head">
        <span class="kpi__label">{{ label() }}</span>
        @if (resolvedAccent() && !loading()) {
          <span class="kpi__accent" [class]="'accent--' + resolvedAccent()"></span>
        }
      </header>

      @if (loading()) {
        <div class="kpi__skeleton-value"></div>
        <div class="kpi__skeleton-foot"></div>
      } @else {
        <div class="kpi__value">{{ value() }}</div>

        <footer class="kpi__foot">
          @if (delta() !== null) {
            <div
              class="delta"
              [class.delta--up]="(delta() ?? 0) >= 0"
              [class.delta--down]="(delta() ?? 0) < 0"
              [attr.aria-label]="((delta() ?? 0) >= 0 ? 'Up ' : 'Down ') + ((delta() ?? 0) | number:'1.1-1') + ' percent versus previous period'">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                @if ((delta() ?? 0) >= 0) {
                  <path d="M3 8l3-3 3 3M6 5v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                } @else {
                  <path d="M3 4l3 3 3-3M6 7V3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                }
              </svg>
              <span class="font-data" aria-hidden="true">{{ (delta() ?? 0) | number:'1.1-1' }}%</span>
            </div>
            <span class="delta__period" aria-hidden="true">vs prev</span>
          }
          @if (subtext()) {
            <div class="subtext">{{ subtext() }}</div>
          }
        </footer>
      }
    </article>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .kpi {
      height: 100%;
      padding: 16px 16px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      position: relative;
      overflow: hidden;
      transition: border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
    }

    .kpi:hover {
      border-color: var(--border-strong);
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(12, 12, 12, 0.04);
    }

    .kpi:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-color: var(--accent);
    }

    .kpi__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .kpi__label {
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      line-height: 1.3;
    }

    .kpi__accent {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }

    .accent--blue   { background: var(--accent); }
    .accent--teal   { background: var(--success); }
    .accent--amber  { background: var(--warning); }
    .accent--plum   { background: var(--accent-plum, #7c3aed); }
    .accent--green  { background: var(--success); }

    // Dashboard-style numeric display — IBM Plex Sans, semibold, tabular figures.
    // Intentionally NOT Fraunces serif because editorial serif numbers are
    // harder to scan in dense operational dashboards.
    .kpi__value {
      font-family: var(--font-sans);
      font-size: 28px;
      line-height: 1.1;
      font-weight: 600;
      color: var(--ink);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum' 1, 'zero' 1;
      margin: 2px 0;
      animation: kpiValueEnter 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    @media (prefers-reduced-motion: reduce) {
      .kpi { transition: none; }
      .kpi:hover { transform: none; }
      .kpi__value,
      .delta,
      .kpi__skeleton-value,
      .kpi__skeleton-foot { animation: none !important; }
    }

    @keyframes kpiValueEnter {
      0%   { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    // Skeleton placeholders
    .kpi__skeleton-value {
      height: 44px;
      width: 60%;
      border-radius: 4px;
      background: linear-gradient(
        90deg,
        var(--surface-2) 0%,
        var(--border) 50%,
        var(--surface-2) 100%
      );
      background-size: 400px 100%;
      animation: kpiShimmer 1.8s ease-in-out infinite;
      margin: 4px 0;
    }

    .kpi__skeleton-foot {
      height: 16px;
      width: 40%;
      border-radius: 3px;
      background: linear-gradient(
        90deg,
        var(--surface-2) 0%,
        var(--border) 50%,
        var(--surface-2) 100%
      );
      background-size: 400px 100%;
      animation: kpiShimmer 1.8s ease-in-out 150ms infinite;
    }

    @keyframes kpiShimmer {
      0%   { background-position: -200px 0; }
      100% { background-position: 200px 0; }
    }

    .kpi__foot {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-height: 16px;
    }

    .delta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      animation: kpiDeltaEnter 600ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
    }

    @keyframes kpiDeltaEnter {
      0%   { opacity: 0; transform: translateY(4px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    .delta--up {
      background: color-mix(in srgb, var(--success) 14%, transparent);
      color: var(--success);
      border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    }

    .delta--down {
      background: color-mix(in srgb, var(--danger) 14%, transparent);
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
    }

    .delta__period {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    .subtext {
      font-size: 11px;
      color: var(--muted);
      font-family: var(--font-sans);
    }
  `],
})
export class KpiCardComponent {
  label = input.required<string>();
  value = input<string | number>(0);
  delta = input<number | null>(null);
  subtext = input<string>('');
  loading = input<boolean>(false);
  tooltip = input<string>('');
  // accent color — maps to a small dot in the header
  accent = input<'blue' | 'teal' | 'amber' | 'plum' | 'green' | null>(null);

  // Backwards compat — older callers pass `gradient` + `icon`
  gradient = input<'blue' | 'teal' | 'orange' | 'purple' | 'green' | null>(null);
  icon = input<string>('');

  // Resolve accent, falling back to the legacy gradient (orange→amber, purple→plum)
  resolvedAccent = computed<string | null>(() => {
    if (this.accent()) return this.accent();
    const g = this.gradient();
    if (!g) return null;
    const map: Record<string, string> = {
      blue: 'blue',
      teal: 'teal',
      orange: 'amber',
      purple: 'plum',
      green: 'green',
    };
    return map[g] ?? 'blue';
  });
}
