import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_COLORS } from '../chart-theme';

export interface HeatmapCell { x: string; y: string; value: number; }

@Component({
  selector: 'app-heatmap-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [subtitle]="subtitle()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="cells().length === 0"></app-base-chart>
  `,
})
export class HeatmapChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  cells = input.required<HeatmapCell[]>();
  xLabels = input.required<string[]>();
  yLabels = input.required<string[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => {
    const cells = this.cells();
    const values = cells.map((c) => c.value);
    const maxVal = values.reduce((a, b) => Math.max(a, b), 1);
    const xs = this.xLabels();
    const ys = this.yLabels();
    const data = cells.map((c) => [xs.indexOf(c.x), ys.indexOf(c.y), c.value]);

    return {
      ...CHART_BASE,
      tooltip: {
        ...CHART_BASE.tooltip,
        position: 'top',
        formatter: (p: any) => `${ys[p.value[1]]} · ${xs[p.value[0]]}<br/><strong>${p.value[2]}</strong>`,
      },
      grid: { left: 60, right: 20, top: 16, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: xs,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.muted,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: ys,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.muted,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
        },
        splitArea: { show: false },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 140,
        textStyle: {
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 10,
          color: CHART_COLORS.muted,
        },
        inRange: {
          color: ['#f5f5f4', '#c7d2fe', '#6366f1', '#312e81'],
        },
      },
      series: [
        {
          type: 'heatmap',
          data,
          label: { show: false },
          itemStyle: { borderColor: CHART_COLORS.surface, borderWidth: 1, borderRadius: 2 },
          emphasis: {
            itemStyle: {
              borderColor: CHART_COLORS.ink,
              borderWidth: 1,
            },
          },
          progressive: 1000,
          animationDuration: 400,
        },
      ],
    } as EChartsOption;
  });
}
