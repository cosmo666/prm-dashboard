import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface HeatmapCell { x: string; y: string; value: number; }

@Component({
  selector: 'app-heatmap-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `<app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="cells().length === 0"></app-base-chart>`,
})
export class HeatmapChartComponent {
  title   = input<string>('');
  cells   = input.required<HeatmapCell[]>();
  xLabels = input.required<string[]>();
  yLabels = input.required<string[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => {
    const cells = this.cells();
    const values = cells.map(c => c.value);
    const xs = this.xLabels(), ys = this.yLabels();
    const data = cells.map(c => [xs.indexOf(c.x), ys.indexOf(c.y), c.value]);
    return {
      tooltip: { position: 'top' },
      grid: { left: 80, right: 20, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: xs, splitArea: { show: true } },
      yAxis: { type: 'category', data: ys, splitArea: { show: true } },
      visualMap: { min: 0, max: Math.max(...values, 1), calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#e3f2fd', '#1565c0'] } },
      series: [{ type: 'heatmap', data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } } }],
    };
  });
}
