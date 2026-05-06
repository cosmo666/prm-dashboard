import { Component, Input, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

export interface BarDatum { label: string; value: number; }

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
          data: this.data.map(d => d.value),
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
}
