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
  @Input() subtitle?: string;
  @Input() loading = false;
  @Input() data: BarDatum[] = [];
  @Input() height = 320;
  // Optional axis labels + tooltip unit (e.g. "services", "%"). Display-only.
  @Input() xLabel = '';
  @Input() yLabel = '';
  @Input() unit = '';
  @Input() seriesName = '';

  // Optional stacked-series mode. When `stackedSeries` is set, each key becomes a
  // series sharing stack='mix'. `stackKeys` preserves order (Object.keys() isn't
  // guaranteed insertion-ordered on older engines our polyfills target).
  // `stackColors` maps series key → color so callers can pin IATA SSR codes
  // (WCHR, WCHC, …) to fixed hues across renders.
  @Input() stackedSeries?: { [code: string]: number[] };
  @Input() stackKeys?: string[];
  @Input() stackColors?: { [code: string]: string };

  // Optional overlay line series rendered on top of the bars (e.g. "Requested"
  // overlaid on serviced bars). Bars use [data] for category alignment; lineSeries
  // values are mapped point-for-point to the same x-axis.
  @Input() lineSeries: BarDatum[] = [];
  @Input() lineSeriesName = '';
  @Input() lineSeriesColor = '#dc2626';

  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    const labels = this.data.map(d => d.label);
    const stacked = this.stackedSeries || {};
    const keys = this.stackKeys || Object.keys(stacked);
    const colors = this.stackColors || {};
    const hasStacked = keys.length > 0;
    const ls = this.lineSeries || [];
    const hasLine = ls.length > 0;

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
          name: this.seriesName || 'Total',
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

    if (hasLine) {
      series.push({
        name: this.lineSeriesName || 'Line',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        data: ls.map(x => x.value),
        lineStyle: { color: this.lineSeriesColor, width: 2 },
        itemStyle:  { color: this.lineSeriesColor },
        z: 5,
      });
    }

    const showLegend = hasStacked || hasLine;
    let legendData: string[] | undefined;
    if (hasStacked) {
      legendData = keys;
    } else if (hasLine) {
      legendData = [this.seriesName || 'Total', this.lineSeriesName || 'Line'];
    }
    const tickFormatter = this.unit === '%'
      ? ((v: number) => v + '%')
      : undefined;
    // echarts 4 has no `valueFormatter` on the tooltip option (added in v5).
    // Use the legacy `formatter` callback to append the unit suffix.
    const unit = this.unit;
    // tslint:disable-next-line: no-any
    const tooltipFormatter = unit
      // tslint:disable-next-line: no-any
      ? ((params: any) => {
          const arr = Array.isArray(params) ? params : [params];
          const lines = arr.map((p: any) => {
            const v = p.value && p.value.value !== undefined ? p.value.value : p.value;
            const formatted = unit === '%' ? `${v}%` : `${v} ${unit}`;
            return `${p.marker || ''}${p.seriesName || ''}: <strong>${formatted}</strong>`;
          });
          const header = arr[0] && arr[0].name ? arr[0].name + '<br/>' : '';
          return header + lines.join('<br/>');
        })
      : undefined;

    this.options = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: tooltipFormatter,
      },
      legend:  showLegend ? { data: legendData, bottom: 0 } : undefined,
      grid:    { left: 40, right: 20, top: 20, bottom: showLegend ? 50 : 30 },
      xAxis:   {
        type: 'category',
        data: labels,
        name: this.xLabel || undefined,
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis:   {
        type: 'value',
        name: this.yLabel || undefined,
        nameLocation: 'middle',
        nameGap: 48,
        nameRotate: 90,
        axisLabel: tickFormatter ? { formatter: tickFormatter } : undefined,
      },
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
