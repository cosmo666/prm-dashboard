import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import * as echarts from 'echarts';
import { DailyTrendResponse } from 'src/app/features/dashboard/services/prm-dtos';
import { ChartAnnotation } from 'src/app/features/dashboard/utils/annotations';
import { resolvePrimary } from '../resolve-primary';

/**
 * Multi-series shape used by the new `[series]` API. When `series` is non-null
 * it takes precedence over `[trend]` + `[secondarySeries]` (which remain for
 * backwards compat). `data` is an array of [x, y] tuples — typically [date, count].
 */
export interface LineSeries {
  name: string;
  data: Array<[string | number, number]>;
  color?: string;
  type?: 'line' | 'bar' | 'area';
  dashed?: boolean;
}

// Deterministic palette for multi-series mode. Index 0 falls back to the
// tenant's resolved primary at render time.
const PALETTE: string[] = ['#2563EB', '#0d9488', '#d4a017', '#8e4ec6', '#e5684f', '#10b981'];

@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.component.html',
})
export class LineChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;

  // Legacy single-series API (kept for back-compat with Overview tab).
  @Input() trend: DailyTrendResponse | null = null;
  /**
   * Period-over-period overlay (OQ-P1-3). When non-null and non-empty, the chart
   * renders a second dotted line at 0.35 opacity in the primary hue. Hidden when
   * null or when values.length === 0 (very short ranges or first-month tenants).
   */
  @Input() secondarySeries: DailyTrendResponse | null = null;

  // New multi-series API. When non-null, supersedes `trend` + `secondarySeries`.
  @Input() series: LineSeries[] | null = null;

  // Optional vertical dashed annotations (holidays, events). Drawn as markLine
  // on the first series only.
  @Input() annotations: ChartAnnotation[] = [];

  // When true, draws a horizontal dashed line at the mean of the first series
  // y-values. Off by default to avoid noise on short series.
  @Input() showAvgLine = false;

  // Stack mode — applies stack: 'total' + areaStyle to every series.
  @Input() stacked = false;

  @Input() loading = false;
  @Input() height = 320;
  @Output() pointClick = new EventEmitter<string>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    if (this.series && this.series.length > 0) {
      this.options = this.buildFromSeries(this.series);
    } else {
      this.options = this.buildFromTrend();
    }
  }

  private buildFromTrend(): EChartOption | null {
    if (!this.trend) { return null; }
    const primary = resolvePrimary();
    const hasPrev = !!(this.secondarySeries && this.secondarySeries.values && this.secondarySeries.values.length > 0);

    const series: any[] = [{
      name: 'Current',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      data: this.trend.values,
      itemStyle: { color: primary },
      lineStyle:  { color: primary, width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: this.alphaHex(primary, 0.25) },
          { offset: 1, color: this.alphaHex(primary, 0.0) },
        ]),
      },
      markLine: {
        symbol: 'none',
        data: [{
          yAxis: this.trend.average,
          lineStyle: { type: 'dashed', color: '#94a3b8' },
          label: { formatter: `Avg ${this.trend.average.toFixed(0)}`, position: 'end' as const },
        }],
      },
    }];

    if (hasPrev) {
      // Render the prev-period values point-for-point against the current period's
      // x-axis. The OverviewTabComponent ensures lengths align; if the prev array
      // is shorter (e.g. month boundary), we right-pad with the last known value
      // so the line spans the full axis without an abrupt drop.
      const prev = (this.secondarySeries as DailyTrendResponse).values.slice(0, this.trend.values.length);
      while (prev.length < this.trend.values.length) {
        prev.push(prev[prev.length - 1] || 0);
      }
      series.push({
        name: 'Prev period',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: prev,
        itemStyle: { color: primary, opacity: 0.35 },
        lineStyle: { color: primary, width: 1.5, type: 'dotted', opacity: 0.35 },
      });
    }

    return {
      tooltip: { trigger: 'axis' },
      legend:  hasPrev ? { data: ['Current', 'Prev period'], right: 0, top: 0, textStyle: { color: '#64748b' } } : undefined,
      grid:    { left: 40, right: 20, top: hasPrev ? 40 : 30, bottom: 40 },
      xAxis: { type: 'category', data: this.trend.dates, axisLine: { lineStyle: { color: '#cbd5e1' } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e2e8f0' } } },
      series,
    };
  }

  private buildFromSeries(srs: LineSeries[]): EChartOption {
    const xs = (srs[0] && srs[0].data) ? srs[0].data.map(d => d[0]) : [];
    const allValues: number[] = [];
    for (const s of srs) {
      for (const d of s.data) { allValues.push(d[1]); }
    }
    const avg = allValues.length ? (allValues.reduce((a, b) => a + b, 0) / allValues.length) : 0;
    const primary = resolvePrimary();

    // Annotations: dashed verticals at matching x positions on the first series only.
    // Label sits inside the chart at the top of the marker line. `padding`
    // gives the text breathing room vs. the dashed stroke; `align: 'center'`
    // anchors the small label box on the line so labels for annotations
    // close to the right edge don't overflow the chart's clip area.
    const annotationMarkLines = (this.annotations || []).map(a => ({
      xAxis: a.date,
      lineStyle: { color: '#94a3b8', type: 'dashed' as const, width: 1, opacity: 0.65 },
      label: {
        formatter: a.label,
        position: 'insideEndTop' as const,
        align: 'center' as const,
        color: '#475569',
        fontSize: 10,
        padding: [3, 6, 3, 6] as [number, number, number, number],
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        borderColor: '#cbd5e1',
        borderWidth: 1,
        borderRadius: 3,
        distance: 6,
      },
    }));

    const chartSeries: any[] = srs.map((s, idx) => {
      const color = s.color || (idx === 0 ? primary : PALETTE[idx % PALETTE.length]);
      const isDashed = s.dashed === true;

      const markLineData: any[] = [];
      if (idx === 0 && this.showAvgLine && !this.stacked && !isDashed) {
        markLineData.push({
          yAxis: avg,
          lineStyle: { type: 'dashed', color: '#94a3b8', width: 1 },
          label: { formatter: `Avg ${avg.toFixed(0)}`, position: 'end', color: '#475569', fontSize: 10 },
        });
      }
      if (idx === 0 && annotationMarkLines.length > 0) {
        for (const m of annotationMarkLines) { markLineData.push(m); }
      }

      const useArea = !isDashed && (s.type === 'area' || this.stacked);

      return {
        name: s.name,
        type: s.type === 'bar' ? 'bar' : 'line',
        stack: this.stacked ? 'total' : undefined,
        data: s.data.map(d => d[1]),
        smooth: true,
        symbol: isDashed ? 'none' : 'circle',
        symbolSize: 4,
        showSymbol: false,
        areaStyle: useArea
          ? {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: this.alphaHex(color, 0.25) },
                { offset: 1, color: this.alphaHex(color, 0.0) },
              ]),
            }
          : undefined,
        itemStyle: { color },
        lineStyle: {
          width: isDashed ? 1.5 : 2,
          color,
          type: isDashed ? 'dashed' : 'solid',
          opacity: isDashed ? 0.75 : 1,
        },
        markLine: markLineData.length
          ? { silent: true, symbol: 'none', data: markLineData }
          : undefined,
      };
    });

    // Annotation labels render inside the grid at top — reserve enough room
    // so the label badge isn't clipped by the chart edge.
    const hasAnnotations = annotationMarkLines.length > 0;
    const hasLegend = srs.length > 1;
    const gridTop = hasLegend ? 48 : (hasAnnotations ? 36 : 30);
    return {
      tooltip: { trigger: 'axis' },
      legend:  hasLegend ? { data: srs.map(s => s.name), right: 0, top: 0, textStyle: { color: '#64748b' } } : undefined,
      grid:    { left: 40, right: 20, top: gridTop, bottom: 40 },
      xAxis: { type: 'category', data: xs, axisLine: { lineStyle: { color: '#cbd5e1' } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e2e8f0' } } },
      series: chartSeries,
    };
  }

  /** Crude alpha-blend for hex/oklch primary. echarts area gradients want hex/rgba. */
  private alphaHex(color: string, alpha: number): string {
    if (color && color[0] === '#' && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    return color;
  }

  onChartClick(event: any): void {
    if (event && event.name) { this.pointClick.emit(event.name); }
  }
}
