import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface LineSeries { name: string; data: Array<[string, number]>; color?: string; type?: 'line' | 'bar' | 'area'; }

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="isEmpty()"></app-base-chart>
  `,
})
export class LineChartComponent {
  title   = input<string>('');
  series  = input.required<LineSeries[]>();
  loading = input<boolean>(false);
  showAvgLine = input<boolean>(true);
  dualAxis = input<boolean>(false);
  stacked = input<boolean>(false);

  isEmpty = computed(() => this.series().every(s => s.data.length === 0));

  chartOptions = computed<EChartsOption>(() => {
    const srs = this.series();
    const xs = srs[0]?.data.map(d => d[0]) ?? [];
    const allValues = srs.flatMap(s => s.data.map(d => d[1]));
    const avg = allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;

    const chartSeries: any[] = srs.map((s, idx) => ({
      name: s.name,
      type: s.type === 'bar' ? 'bar' : 'line',
      stack: this.stacked() ? 'total' : undefined,
      yAxisIndex: this.dualAxis() && idx === 1 ? 1 : 0,
      data: s.data.map(d => d[1]),
      smooth: true,
      areaStyle: (s.type === 'area' || this.stacked()) ? { opacity: 0.35 } : undefined,
      itemStyle: s.color ? { color: s.color } : undefined,
      lineStyle: { width: 2 },
      markLine: (idx === 0 && this.showAvgLine()) ? {
        silent: true,
        data: [{ yAxis: avg, lineStyle: { type: 'dashed', color: '#888' }, label: { formatter: `Avg: ${avg.toFixed(0)}` } }],
      } : undefined,
      animationDuration: 300,
    }));

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 60, right: 60, top: 40, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: xs, boundaryGap: srs.some(s => s.type === 'bar') },
      yAxis: this.dualAxis()
        ? [{ type: 'value', position: 'left' }, { type: 'value', position: 'right' }]
        : { type: 'value' },
      series: chartSeries,
    };
  });
}
