import { Component, Input, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';

export interface BarDatum { label: string; value: number; }

@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
})
export class BarChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() loading = false;
  @Input() data: BarDatum[] = [];
  @Input() height = 320;

  options: EChartOption | null = null;

  ngOnChanges(): void {
    this.options = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: this.data.map(d => d.label) },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: this.data.map(d => d.value) }],
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
    };
  }
}
