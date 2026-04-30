import { Component, input, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe, TooltipDirective],
  template: `
    <article class="kpi" [class.kpi--loading]="loading()"
             [class.kpi--spark]="!loading() && sparkPath()"
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
            <span class="delta__period" aria-hidden="true">{{ deltaLabel() || 'vs prev' }}</span>
          }
          @if (subtext()) {
            <div class="subtext">{{ subtext() }}</div>
          }
        </footer>

        @if (sparkPath(); as p) {
          <div class="kpi__spark" aria-hidden="true">
            <svg viewBox="0 0 100 32" preserveAspectRatio="none">
              <defs>
                <linearGradient [attr.id]="'kpi-spark-grad-' + sparkId()" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" [attr.stop-color]="sparkColor()" stop-opacity="0.22"/>
                  <stop offset="100%" [attr.stop-color]="sparkColor()" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path [attr.d]="sparkArea()" [attr.fill]="'url(#kpi-spark-grad-' + sparkId() + ')'" stroke="none"/>
              <path [attr.d]="p" fill="none" [attr.stroke]="sparkColor()" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        }
      }
    </article>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .kpi {
      height: 100%;
      padding: 14px 16px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
      position: relative;
      overflow: hidden;
      min-height: 120px;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }

    .kpi:hover {
      border-color: var(--border-strong);
      box-shadow: var(--shadow-1);
    }

    .kpi:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-color: var(--accent);
    }

    .kpi__head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kpi__label {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--muted);
      line-height: 1.2;
    }

    .kpi__accent {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .accent--blue   { background: var(--c-cat-1, var(--accent)); }
    .accent--teal   { background: var(--c-cat-5, var(--success)); }
    .accent--amber  { background: var(--c-cat-3, var(--warning)); }
    .accent--plum   { background: var(--c-cat-2, #7c3aed); }
    .accent--green  { background: var(--c-cat-4, var(--success)); }

    .kpi__value {
      font-family: var(--font-sans);
      font-size: 28px;
      line-height: 1.05;
      font-weight: 600;
      color: var(--ink);
      letter-spacing: -0.025em;
      font-variant-numeric: tabular-nums;
      font-feature-settings: 'tnum' 1, 'zero' 1;
      margin: 0;
      animation: kpiValueEnter 400ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    @media (prefers-reduced-motion: reduce) {
      .kpi { transition: none; }
      .kpi__value, .delta, .kpi__skeleton-value, .kpi__skeleton-foot { animation: none !important; }
    }

    @keyframes kpiValueEnter {
      0%   { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    .kpi__skeleton-value {
      height: 36px;
      width: 60%;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--surface-2) 0%, var(--border) 50%, var(--surface-2) 100%);
      background-size: 400px 100%;
      animation: kpiShimmer 1.8s ease-in-out infinite;
      margin: 4px 0;
    }

    .kpi__skeleton-foot {
      height: 16px;
      width: 40%;
      border-radius: 3px;
      background: linear-gradient(90deg, var(--surface-2) 0%, var(--border) 50%, var(--surface-2) 100%);
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
      min-height: 18px;
    }

    .delta {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 5px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      animation: kpiDeltaEnter 500ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
    }

    @keyframes kpiDeltaEnter {
      0%   { opacity: 0; transform: translateY(3px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    .delta--up {
      background: var(--success-soft);
      color: var(--success);
    }

    .delta--down {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .delta__period {
      font-family: var(--font-sans);
      font-size: 11px;
      color: var(--muted);
    }

    .subtext {
      font-family: var(--font-sans);
      font-size: 11.5px;
      color: var(--muted);
    }

    // Sparkline — inline SVG footer strip
    .kpi__spark {
      height: 36px;
      margin: 4px -4px -4px;
    }

    .kpi__spark svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .kpi--spark { min-height: 150px; }
  `],
})
export class KpiCardComponent {
  label = input.required<string>();
  value = input<string | number>(0);
  delta = input<number | null>(null);
  deltaLabel = input<string>('');
  subtext = input<string>('');
  loading = input<boolean>(false);
  tooltip = input<string>('');
  // accent color — maps to a small dot in the header AND the sparkline stroke
  accent = input<'blue' | 'teal' | 'amber' | 'plum' | 'green' | null>(null);
  // Small trend series shown as a sparkline under the value
  sparkData = input<number[] | null>(null);

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

  // CSS var for the sparkline stroke — matches the accent dot
  sparkColor = computed<string>(() => {
    const a = this.resolvedAccent();
    const map: Record<string, string> = {
      blue: 'var(--c-cat-1, #5b5bd6)',
      teal: 'var(--c-cat-5, #2f9e6e)',
      amber: 'var(--c-cat-3, #d4a017)',
      plum: 'var(--c-cat-2, #8e4ec6)',
      green: 'var(--c-cat-4, #e5684f)',
    };
    return (a && map[a]) || 'var(--accent)';
  });

  // Stable-per-instance id so SVG gradient defs don't collide across cards
  private _id = Math.random().toString(36).slice(2, 8);
  sparkId = computed<string>(() => this._id);

  // Normalize sparkData into a viewBox-relative polyline path (100 wide × 32 tall).
  // Pads ±5% vertically so the line never kisses the top/bottom edge.
  sparkPath = computed<string | null>(() => {
    const d = this.sparkData();
    if (!d || d.length < 2) return null;
    return this.buildPath(d, /*asArea*/ false);
  });

  sparkArea = computed<string>(() => {
    const d = this.sparkData();
    if (!d || d.length < 2) return '';
    return this.buildPath(d, /*asArea*/ true);
  });

  private buildPath(d: readonly number[], asArea: boolean): string {
    const min = Math.min(...d);
    const max = Math.max(...d);
    const pad = (max - min) * 0.1 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const w = 100;
    const h = 32;
    const step = d.length === 1 ? 0 : w / (d.length - 1);
    const pts: string[] = [];
    for (let i = 0; i < d.length; i++) {
      const x = (i * step).toFixed(2);
      const y = (h - ((d[i] - lo) / (hi - lo)) * h).toFixed(2);
      pts.push(`${x},${y}`);
    }
    if (asArea) {
      return `M${pts[0]} L${pts.slice(1).join(' L')} L${w},${h} L0,${h} Z`;
    }
    return `M${pts[0]} L${pts.slice(1).join(' L')}`;
  }
}
