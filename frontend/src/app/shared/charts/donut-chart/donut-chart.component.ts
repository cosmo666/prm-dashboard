import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface DonutDatum { name: string; value: number; color?: string; }

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="segmentClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class DonutChartComponent {
  title   = input<string>('');
  data    = input.required<DonutDatum[]>();
  loading = input<boolean>(false);
  segmentClick = output<string>();

  chartOptions = computed<EChartsOption>(() => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { orient: 'horizontal', bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['50%', '75%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%' },
      emphasis: { scale: true, scaleSize: 6, label: { fontSize: 14, fontWeight: 'bold' } },
      data: this.data().map(d => ({ name: d.name, value: d.value, itemStyle: d.color ? { color: d.color } : undefined })),
      animationDuration: 300,
    }],
  }));
}
