import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import * as echarts from 'echarts';
import { DailyTrendResponse } from 'src/app/features/dashboard/services/prm-dtos';
import { ChartAnnotation } from 'src/app/features/dashboard/utils/annotations';
import { resolvePrimary } from '../resolve-primary';
import {
  CHART_TOOLTIP,
  CROSS_AXIS_POINTER,
  CHART_LEGEND_TOP_LEFT,
  VALUE_AXIS_WITH_GRID,
  CATEGORY_AXIS,
} from '../chart-theme';

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

  // Dual-axis mode — bar series sit on yAxis 0 (left), line/area series on yAxis 1
  // (right). Used by Fulfillment's "Daily Provided vs Requested" so bar/line of
  // similar magnitudes don't interfere visually. Mutually exclusive with `stacked`.
  @Input() dualAxis = false;

  // Optional axis labels — surface in the chart so callers needn't restyle.
  // Backwards-compatible: existing call sites that omit these get the same
  // unlabelled axes as before.
  @Input() xLabel = '';
  @Input() yLabel = '';
  @Input() unit = '';

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
      tooltip: {
        ...CHART_TOOLTIP,
        trigger: 'axis',
        axisPointer: CROSS_AXIS_POINTER,
      },
      legend: hasPrev
        ? { ...CHART_LEGEND_TOP_LEFT, data: ['Current', 'Prev period'] }
        : undefined,
      grid: { left: 48, right: 20, top: hasPrev ? 36 : 24, bottom: 40 },
      xAxis: { ...CATEGORY_AXIS, data: this.trend.dates },
      yAxis: { ...VALUE_AXIS_WITH_GRID },
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
          // Render the "Avg N" label INSIDE the grid (insideEndTop) with a
          // soft white badge so it sits cleanly above the line at the right
          // edge. Earlier `position: 'end'` painted outside the grid and got
          // clipped by the chart container.
          label: {
            formatter: `Avg ${avg.toFixed(0)}`,
            position: 'insideEndTop',
            color: '#475569',
            fontSize: 10,
            fontWeight: 500,
            padding: [2, 5],
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 3,
            borderColor: '#e2e8f0',
            borderWidth: 1,
            distance: -2,
          },
        });
      }
      if (idx === 0 && annotationMarkLines.length > 0) {
        for (const m of annotationMarkLines) { markLineData.push(m); }
      }

      const useArea = !isDashed && (s.type === 'area' || this.stacked);
      const isBar = s.type === 'bar';

      // Dual-axis mapping: bars to the left axis (idx 0), line/area to the
      // right (idx 1). Single-axis mode leaves yAxisIndex unset.
      const yAxisIndex = this.dualAxis ? (isBar ? 0 : 1) : undefined;

      return {
        name: s.name,
        type: isBar ? 'bar' : 'line',
        stack: this.stacked ? 'total' : undefined,
        yAxisIndex,
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
    const xLabel = this.xLabel;
    const gridTop = hasLegend ? 48 : (hasAnnotations ? 36 : 30);
    // grid.bottom reserves space for x-axis ticks (~24) + xLabel title (~24
    // when set) so the title doesn't collide with the tick row.
    const gridBottom = xLabel ? 56 : 40;
    // Dual-axis mode mirrors the y-axis: index 0 (left) for bars, index 1
    // (right) for lines. Equal scales aren't enforced — echarts auto-fits each.
    const yAxis: any = this.dualAxis
      ? [
          {
            ...VALUE_AXIS_WITH_GRID,
            name: this.yLabel || undefined,
            nameLocation: 'middle',
            nameGap: 48,
            nameRotate: 90,
          },
          {
            ...VALUE_AXIS_WITH_GRID,
            splitLine: { show: false },
          },
        ]
      : {
          ...VALUE_AXIS_WITH_GRID,
          name: this.yLabel || undefined,
          nameLocation: 'middle',
          nameGap: 48,
          nameRotate: 90,
        };
    // Reserve a touch more space on the right when a second axis is shown.
    const gridRight = this.dualAxis ? 50 : 20;
    return {
      tooltip: {
        ...CHART_TOOLTIP,
        trigger: 'axis',
        axisPointer: CROSS_AXIS_POINTER,
      },
      legend: hasLegend
        ? { ...CHART_LEGEND_TOP_LEFT, data: srs.map(s => s.name) }
        : undefined,
      grid: { left: 48, right: gridRight, top: gridTop, bottom: gridBottom },
      xAxis: {
        ...CATEGORY_AXIS,
        data: xs,
        name: xLabel || undefined,
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis,
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
