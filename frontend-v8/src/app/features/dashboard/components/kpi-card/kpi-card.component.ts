import { Component, Input, OnChanges } from '@angular/core';

export type KpiAccent = 'blue' | 'teal' | 'amber' | 'plum' | 'green' | null;

@Component({
  selector: 'app-kpi-card',
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
})
export class KpiCardComponent implements OnChanges {
  // ── Existing API (kept for back-compat with the current Overview tab) ──
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() delta: number | null = null;
  @Input() subtext: string | null = null;
  @Input() loading = false;
  @Input() icon: string | null = null;   // e.g. 'pi-chart-bar'

  // ── New props ──
  @Input() accent: KpiAccent = null;       // small dot in header + sparkline stroke
  @Input() tooltip = '';                    // [pTooltip] on host article
  @Input() sparkData: number[] | null = null;
  @Input() deltaLabel = '';                 // overrides default "vs prev period"
  @Input() unit = '';                       // small unit suffix beside value ("services", "min", etc.)

  // Stable per-instance id so SVG gradient defs don't collide across cards.
  // Computed in the constructor (not getter) per spec — Math.random() in the
  // template would re-run every change-detection tick.
  sparkId: string;

  // Cached SVG paths so the template doesn't re-compute on every CD cycle.
  sparkPath: string | null = null;
  sparkArea = '';

  constructor() {
    this.sparkId = Math.random().toString(36).slice(2, 8);
  }

  ngOnChanges(): void {
    const d = this.sparkData;
    if (!d || d.length < 2) {
      this.sparkPath = null;
      this.sparkArea = '';
      return;
    }
    this.sparkPath = this.buildPath(d, false);
    this.sparkArea = this.buildPath(d, true);
  }

  // ── Existing delta classification ── 0.1% threshold for is-flat
  get deltaClass(): string {
    if (this.delta === null || this.delta === undefined) { return ''; }
    if (this.delta >= 0.1)  { return 'is-up'; }
    if (this.delta <= -0.1) { return 'is-down'; }
    return 'is-flat';
  }

  get formattedDelta(): string {
    if (this.delta === null || this.delta === undefined) { return ''; }
    const sign = this.delta > 0 ? '+' : '';
    return sign + this.delta.toFixed(1) + '%';
  }

  /**
   * Resolves the accent name. Prefers `accent` input; falls back to nothing.
   * (No `gradient` prop on this branch — main's legacy mapping isn't needed.)
   */
  get resolvedAccent(): KpiAccent {
    return this.accent;
  }

  /** CSS color for the sparkline stroke — matches the accent dot. */
  get sparkColor(): string {
    const a = this.resolvedAccent;
    switch (a) {
      case 'blue':  return '#2563EB';
      case 'teal':  return '#0d9488';
      case 'amber': return '#d4a017';
      case 'plum':  return '#8e4ec6';
      case 'green': return '#10b981';
      default:      return 'var(--app-primary, #2563EB)';
    }
  }

  /** Default delta label when none supplied. */
  get effectiveDeltaLabel(): string {
    return this.deltaLabel || 'vs prev period';
  }

  /**
   * Build a viewBox-relative polyline path (100 wide × 32 tall).
   * Pads the y range by 10% so the line never kisses the top/bottom edge.
   */
  private buildPath(d: number[], asArea: boolean): string {
    let min = d[0];
    let max = d[0];
    for (const v of d) {
      if (v < min) { min = v; }
      if (v > max) { max = v; }
    }
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
      pts.push(x + ',' + y);
    }
    if (asArea) {
      return 'M' + pts[0] + ' L' + pts.slice(1).join(' L') + ' L' + w + ',' + h + ' L0,' + h + ' Z';
    }
    return 'M' + pts[0] + ' L' + pts.slice(1).join(' L');
  }
}
