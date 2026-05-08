import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface ShareBarDatum {
  name: string;
  value: number;
  color?: string;
  // Optional one-line description shown after the code (e.g. for IATA
  // SSR codes: "Wheelchair · Ramp"). Hidden when empty.
  label?: string;
}

/**
 * Horizontal ranked share-of-whole bars. One row per category, sorted
 * descending by value. Each row shows: name (left), filled bar tinted
 * by the per-row color, and value + percentage of `total` (right).
 *
 * Replaces the donut chart for multi-category share visualisations
 * because:
 *  1. Donut center text drifts off-axis when the bottom legend pushes
 *     the series upward — no such problem with a flat list of rows.
 *  2. Donut percentages had to be re-normalised to the rendered top-N,
 *     which disagreed with the per-category cards above. Bars are
 *     ALWAYS normalised to the caller-supplied `total` (the full
 *     population), so the share matches the cards exactly.
 *  3. Ranking + share are visible in one block — the donut + cards
 *     row was conveying the same data twice.
 *
 * Pure CSS — no echarts, no canvas. Works inside `<app-base-chart>`
 * for header / loading / empty-state consistency with the other
 * charts on the dashboard.
 */
@Component({
  selector: 'app-share-bars',
  templateUrl: './share-bars.component.html',
  styleUrls: ['./share-bars.component.scss'],
})
export class ShareBarsComponent {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() data: ShareBarDatum[] = [];
  @Input() loading: boolean | null = false;
  // The denominator used to compute each row's percentage. When this
  // is omitted we fall back to the sum of `data.value`, which makes
  // sense only when the caller is showing every category.
  @Input() total?: number;
  // Maximum number of rows to render. Defaults to 10 (everything-most
  // dashboards need); pass a smaller number to truncate.
  @Input() limit = 10;
  @Output() rowClick = new EventEmitter<{ name: string; value: number }>();

  /**
   * Rows sorted descending, capped at `limit`, with per-row pct computed
   * against the resolved denominator. Computed inline (not memoised) —
   * the data is small (≤9 rows) so the cost is irrelevant.
   */
  get rows(): Array<ShareBarDatum & { pct: number; widthPct: number }> {
    if (!this.data || this.data.length === 0) { return []; }
    const sorted = this.data.slice().sort((a, b) => b.value - a.value).slice(0, this.limit);
    const denominator = (this.total !== undefined && this.total !== null && this.total > 0)
      ? this.total
      : sorted.reduce((a, b) => a + b.value, 0) || 1;
    // Width of the FILLED part of each bar is normalised against the
    // largest row, NOT against the denominator — that way the longest
    // bar always reaches the right edge and the relative magnitudes
    // are easy to scan. The textual percentage is the share of total.
    const maxValue = sorted[0] ? sorted[0].value : 1;
    return sorted.map(d => ({
      ...d,
      pct: (d.value / denominator) * 100,
      widthPct: (d.value / maxValue) * 100,
    }));
  }

  onRowClick(d: ShareBarDatum): void {
    this.rowClick.emit({ name: d.name, value: d.value });
  }

  /**
   * True when the data is non-empty. Lets the empty-state branch in the
   * template render an inline message without checking length twice.
   */
  hasData(): boolean { return !!this.data && this.data.length > 0; }
}
