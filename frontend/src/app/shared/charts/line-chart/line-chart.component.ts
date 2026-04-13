import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_CATEGORY_AXIS, CHART_VALUE_AXIS, CHART_PALETTE, CHART_COLORS } from '../chart-theme';
import { ChartAnnotation } from '../../../features/dashboard/utils/annotations';

export interface LineSeries {
  name: string;
  data: Array<[string, number]>;
  color?: string;
  type?: 'line' | 'bar' | 'area';
  dashed?: boolean;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [subtitle]="subtitle()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="isEmpty()"
      (chartClick)="pointClick.emit($event.name)"></app-base-chart>
  `,
})
export class LineChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  series = input.required<LineSeries[]>();
  loading = input<boolean>(false);
  showAvgLine = input<boolean>(true);
  dualAxis = input<boolean>(false);
  stacked = input<boolean>(false);
  annotations = input<ChartAnnotation[]>([]);
  xLabel = input<string>('');
  yLabel = input<string>('');
  yLabelRight = input<string>('');
  unit = input<string>('');
  unitRight = input<string>('');
  pointClick = output<string>();

  private formatNumber(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '—';
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  private formatTickFor(unit: string) {
    return (v: number) => {
      const num = this.formatNumber(v);
      return unit === '%' ? `${num}%` : num;
    };
  }

  private formatValueFor(unit: string) {
    return (v: any) => {
      const num = this.formatNumber(Number(v));
      if (!unit) return num;
      return unit === '%' ? `${num}%` : `${num} ${unit}`;
    };
  }

  isEmpty = computed(() => this.series().every((s) => s.data.length === 0));

  chartOptions = computed<EChartsOption>(() => {
    const srs = this.series();
    const xs = srs[0]?.data.map((d) => d[0]) ?? [];
    const allValues = srs.flatMap((s) => s.data.map((d) => d[1]));
    const avg = allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;

    // Resolve --muted at runtime for markLine colors (ECharts can't read CSS vars).
    // Re-computes on every options rebuild; acceptable for theme changes triggered by filter updates.
    const mutedColor = (typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()
      : '') || CHART_COLORS.muted;

    const annotationMarkLineData = this.annotations().map((a) => ({
      xAxis: a.date,
      lineStyle: { color: mutedColor, type: 'dashed' as const, width: 1, opacity: 0.65 },
      label: {
        formatter: a.label,
        position: 'insideEndTop' as const,
        color: mutedColor,
        fontFamily: '"IBM Plex Sans", sans-serif',
        fontSize: 10,
        distance: 4,
      },
    }));

    const chartSeries: any[] = srs.map((s, idx) => {
      const color = s.color ?? CHART_PALETTE[idx % CHART_PALETTE.length];
      const isDashed = s.dashed === true;

      // Collect mark lines: avg (first solid series only) + annotations (first series only)
      const markLineData: any[] = [];
      if (idx === 0 && this.showAvgLine() && !this.stacked() && !isDashed) {
        markLineData.push({
          yAxis: avg,
          lineStyle: { type: 'dashed', color: CHART_COLORS.muted, width: 1 },
          label: {
            formatter: `Avg ${avg.toFixed(0)}`,
            position: 'end',
            color: CHART_COLORS.muted,
            fontSize: 10,
            fontFamily: '"IBM Plex Sans", sans-serif',
          },
        });
      }
      if (idx === 0 && annotationMarkLineData.length > 0) {
        markLineData.push(...annotationMarkLineData);
      }

      return {
        name: s.name,
        type: s.type === 'bar' ? 'bar' : 'line',
        stack: this.stacked() ? 'total' : undefined,
        yAxisIndex: this.dualAxis() && idx === 1 ? 1 : 0,
        data: s.data.map((d) => d[1]),
        smooth: true,
        symbol: isDashed ? 'none' : 'circle',
        symbolSize: 4,
        showSymbol: false,
        areaStyle:
          !isDashed && (s.type === 'area' || this.stacked())
            ? {
                opacity: 0.16,
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: color + 'aa' },
                    { offset: 1, color: color + '00' },
                  ],
                },
              }
            : undefined,
        itemStyle: { color },
        lineStyle: {
          width: isDashed ? 1.5 : 1.75,
          color,
          type: isDashed ? 'dashed' : 'solid',
          opacity: isDashed ? 0.75 : 1,
        },
        emphasis: { focus: 'series', scale: 1.4 },
        markLine: markLineData.length
          ? { silent: true, symbol: 'none', data: markLineData }
          : undefined,
        animationDuration: 500,
        animationEasing: 'cubicOut',
      };
    });

    const nameTextStyle = { color: CHART_COLORS.muted, fontSize: 11, fontWeight: 600 as const };
    const xName = this.xLabel();
    const yName = this.yLabel();
    const yNameRight = this.yLabelRight();
    const unit = this.unit();
    const unitRight = this.unitRight();

    return {
      ...CHART_BASE,
      grid: {
        ...CHART_BASE.grid,
        top: srs.length > 1 ? 40 : 24,
        right: yNameRight ? 60 : 40,
        bottom: xName ? 56 : CHART_BASE.grid.bottom,
        left: yName ? 60 : CHART_BASE.grid.left,
      },
      tooltip: {
        ...CHART_BASE.tooltip,
        trigger: 'axis',
        valueFormatter: this.formatValueFor(unit),
        axisPointer: {
          type: 'cross',
          crossStyle: { color: CHART_COLORS.border },
          lineStyle: { color: CHART_COLORS.border, width: 1, type: 'dashed' },
        },
      },
      xAxis: {
        ...CHART_CATEGORY_AXIS,
        data: xs,
        boundaryGap: srs.some((s) => s.type === 'bar'),
        name: xName || undefined,
        nameLocation: 'middle' as const,
        nameGap: 36,
        nameTextStyle,
      },
      yAxis: this.dualAxis()
        ? [
            {
              ...CHART_VALUE_AXIS,
              position: 'left',
              name: yName || undefined,
              nameLocation: 'middle' as const,
              nameGap: 48,
              nameRotate: 90,
              nameTextStyle,
              axisLabel: { ...CHART_VALUE_AXIS.axisLabel, formatter: this.formatTickFor(unit) },
            },
            {
              ...CHART_VALUE_AXIS,
              position: 'right',
              splitLine: { show: false },
              name: yNameRight || undefined,
              nameLocation: 'middle' as const,
              nameGap: 48,
              nameRotate: 90,
              nameTextStyle,
              axisLabel: { ...CHART_VALUE_AXIS.axisLabel, formatter: this.formatTickFor(unitRight) },
            },
          ]
        : {
            ...CHART_VALUE_AXIS,
            name: yName || undefined,
            nameLocation: 'middle' as const,
            nameGap: 48,
            nameRotate: 90,
            nameTextStyle,
            axisLabel: { ...CHART_VALUE_AXIS.axisLabel, formatter: this.formatTickFor(unit) },
          },
      series: chartSeries,
    } as EChartsOption;
  });
}
