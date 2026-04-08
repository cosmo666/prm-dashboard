import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface BarDatum { label: string; value: number; color?: string; }

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="barClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class BarChartComponent {
  title    = input<string>('');
  data     = input.required<BarDatum[]>();
  loading  = input<boolean>(false);
  xLabel   = input<string>('');
  yLabel   = input<string>('');
  horizontal = input<boolean>(false);
  barClick = output<string>();

  chartOptions = computed<EChartsOption>(() => {
    const d = this.data();
    const names = d.map(x => x.label);
    const values = d.map(x => ({ value: x.value, itemStyle: x.color ? { color: x.color } : undefined }));
    const xAxis: any = this.horizontal() ? { type: 'value', name: this.xLabel() } : { type: 'category', data: names, name: this.xLabel(), axisLabel: { rotate: 30 } };
    const yAxis: any = this.horizontal() ? { type: 'category', data: names, name: this.yLabel() } : { type: 'value', name: this.yLabel() };
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 60, right: 20, top: 30, bottom: 60, containLabel: true },
      xAxis, yAxis,
      series: [{
        type: 'bar',
        data: values,
        itemStyle: { color: '#1e88e5', borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { color: '#1565c0', shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
        animationDuration: 300,
      }],
    };
  });
}
