import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

export interface BarDatum { label: string; value: number; color?: string; }

@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
})
export class BarChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() loading = false;
  @Input() data: BarDatum[] = [];
  @Input() height = 320;
  // Optional stacked-series mode. When `stackedSeries` is set, each key becomes a
  // series sharing stack='mix'. `stackKeys` preserves order (Object.keys() isn't
  // guaranteed insertion-ordered on older engines our polyfills target).
  // `stackColors` maps series key → color so callers can pin IATA SSR codes
  // (WCHR, WCHC, …) to fixed hues across renders.
  @Input() stackedSeries?: { [code: string]: number[] };
  @Input() stackKeys?: string[];
  @Input() stackColors?: { [code: string]: string };

  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    const labels = this.data.map(d => d.label);
    const stacked = this.stackedSeries || {};
    const keys = this.stackKeys || Object.keys(stacked);
    const colors = this.stackColors || {};
    const hasStacked = keys.length > 0;

    const series: any[] = hasStacked
      ? keys.map(k => ({
          name: k,
          type: 'bar',
          stack: 'mix',
          data: stacked[k] || [],
          itemStyle: { color: colors[k] || resolvePrimary() },
          emphasis: { focus: 'series' },
        }))
      : [{
          name: 'Total',
          type: 'bar',
          // Per-bar color override: BarDatum.color (when present) wins over the
          // series fallback so callers can paint individual bars (e.g. weekend
          // days in a different hue) without falling back to stacked-series
          // mode for a single-series chart.
          data: this.data.map(d => ({
            value: d.value,
            itemStyle: d.color ? { color: d.color } : undefined,
          })),
          itemStyle: { color: resolvePrimary() },
          emphasis: { focus: 'series' },
        }];

    this.options = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend:  hasStacked ? { data: keys, bottom: 0 } : undefined,
      grid:    { left: 40, right: 20, top: 20, bottom: hasStacked ? 50 : 30 },
      xAxis:   { type: 'category', data: labels },
      yAxis:   { type: 'value' },
      series,
    };
  }

  onChartClick(event: any): void {
    if (!event) { return; }
    const category = (event.name as string) || (event.data && event.data.name);
    if (category) {
      const row = this.data.find(r => r.label === category);
      this.barClick.emit({ category, value: row ? row.value : (event.value as number) || 0 });
    }
  }
}
