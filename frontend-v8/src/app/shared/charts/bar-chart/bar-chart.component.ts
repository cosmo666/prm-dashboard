import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';
import {
  CHART_TOOLTIP,
  CROSS_AXIS_POINTER,
  CHART_LEGEND_TOP_LEFT,
  VALUE_AXIS_WITH_GRID,
  CATEGORY_AXIS,
} from '../chart-theme';

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

  // Optional second BAR series rendered side-by-side with the primary bars
  // (echarts auto-groups bars when two `type: 'bar'` series share a category
  // x-axis without a `stack` field). Used by Insights' "Self vs Outsourced
  // Duration" chart. Mutually exclusive with `stackedSeries`; `lineSeries`
  // can still overlay on top.
  @Input() series2?: BarDatum[];
  @Input() series2Name = 'Series 2';
  @Input() series2Color = '#fb8c00';

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
    const s2 = this.series2 || [];
    // Grouped-bars mode is only meaningful for the single-series API
    // (stackedSeries owns its own multi-series shape). When both `series2` and
    // `stackedSeries` are passed, stacked wins — same precedence as `lineSeries`.
    const hasGrouped = !hasStacked && s2.length > 0;

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

    if (hasGrouped) {
      // Second bar series — echarts groups bars side-by-side when neither
      // series sets a `stack`. Aligned point-for-point with the primary
      // category list (`data`); shorter inputs fall back to 0.
      series.push({
        name: this.series2Name || 'Series 2',
        type: 'bar',
        data: this.data.map((_, i) => (s2[i] && s2[i].value !== undefined ? s2[i].value : 0)),
        itemStyle: { color: this.series2Color },
        emphasis: { focus: 'series' },
      });
    }

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

    const showLegend = hasStacked || hasLine || hasGrouped;
    let legendData: string[] | undefined;
    if (hasStacked) {
      legendData = keys;
    } else if (hasGrouped && hasLine) {
      legendData = [this.seriesName || 'Total', this.series2Name || 'Series 2', this.lineSeriesName || 'Line'];
    } else if (hasGrouped) {
      legendData = [this.seriesName || 'Total', this.series2Name || 'Series 2'];
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
        ...CHART_TOOLTIP,
        trigger: 'axis',
        // 'cross' surfaces both the hovered category column AND the y
        // value at the cursor, with axis-label badges on both axes —
        // matches the line-chart hover behaviour for visual parity.
        axisPointer: CROSS_AXIS_POINTER,
        formatter: tooltipFormatter,
      },
      // Top-left legend matching the rest of the chart family. Was
      // bottom-aligned with `bottom: 0` — moved up to free that space
      // for the x-axis tick row + optional axis title.
      legend: showLegend
        ? { ...CHART_LEGEND_TOP_LEFT, data: legendData }
        : undefined,
      // grid.top reserves vertical space for the legend strip (~28px)
      // when shown. grid.bottom no longer carves out legend room since
      // the legend now sits at the top.
      grid: {
        left: 48,
        right: 20,
        top: showLegend ? 36 : 20,
        bottom: this.xLabel ? 50 : 30,
      },
      xAxis: {
        ...CATEGORY_AXIS,
        data: labels,
        name: this.xLabel || undefined,
        nameLocation: 'middle',
        nameGap: 30,
      },
      // y-axis adds horizontal dashed split lines so the column heights
      // are readable at a glance — the "y-axis grid" the user asked for
      // on column charts.
      yAxis: {
        ...VALUE_AXIS_WITH_GRID,
        name: this.yLabel || undefined,
        nameLocation: 'middle',
        nameGap: 48,
        nameRotate: 90,
        axisLabel: tickFormatter
          ? { ...VALUE_AXIS_WITH_GRID.axisLabel, formatter: tickFormatter }
          : VALUE_AXIS_WITH_GRID.axisLabel,
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
