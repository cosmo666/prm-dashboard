import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_CATEGORY_AXIS, CHART_VALUE_AXIS, CHART_PALETTE, CHART_COLORS } from '../chart-theme';

export interface LineSeries {
  name: string;
  data: Array<[string, number]>;
  color?: string;
  type?: 'line' | 'bar' | 'area';
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
      [isEmpty]="isEmpty()"></app-base-chart>
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

  isEmpty = computed(() => this.series().every((s) => s.data.length === 0));

  chartOptions = computed<EChartsOption>(() => {
    const srs = this.series();
    const xs = srs[0]?.data.map((d) => d[0]) ?? [];
    const allValues = srs.flatMap((s) => s.data.map((d) => d[1]));
    const avg = allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;

    const chartSeries: any[] = srs.map((s, idx) => {
      const color = s.color ?? CHART_PALETTE[idx % CHART_PALETTE.length];
      return {
        name: s.name,
        type: s.type === 'bar' ? 'bar' : 'line',
        stack: this.stacked() ? 'total' : undefined,
        yAxisIndex: this.dualAxis() && idx === 1 ? 1 : 0,
        data: s.data.map((d) => d[1]),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: false,
        areaStyle:
          s.type === 'area' || this.stacked()
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
        lineStyle: { width: 1.75, color },
        emphasis: { focus: 'series', scale: 1.4 },
        markLine:
          idx === 0 && this.showAvgLine() && !this.stacked()
            ? {
                silent: true,
                symbol: 'none',
                data: [
                  {
                    yAxis: avg,
                    lineStyle: { type: 'dashed', color: CHART_COLORS.muted, width: 1 },
                    label: {
                      formatter: `Avg ${avg.toFixed(0)}`,
                      position: 'end',
                      color: CHART_COLORS.muted,
                      fontSize: 10,
                      fontFamily: '"IBM Plex Mono", monospace',
                    },
                  },
                ],
              }
            : undefined,
        animationDuration: 500,
        animationEasing: 'cubicOut',
      };
    });

    return {
      ...CHART_BASE,
      grid: { ...CHART_BASE.grid, top: srs.length > 1 ? 36 : 20, right: 40 },
      xAxis: {
        ...CHART_CATEGORY_AXIS,
        data: xs,
        boundaryGap: srs.some((s) => s.type === 'bar'),
      },
      yAxis: this.dualAxis()
        ? [
            { ...CHART_VALUE_AXIS, position: 'left' },
            { ...CHART_VALUE_AXIS, position: 'right', splitLine: { show: false } },
          ]
        : CHART_VALUE_AXIS,
      series: chartSeries,
    } as EChartsOption;
  });
}
