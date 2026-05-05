import { Component, Input } from '@angular/core';
import { EChartOption } from 'echarts';

@Component({
  selector: 'app-base-chart',
  templateUrl: './base-chart.component.html',
  styleUrls: ['./base-chart.component.scss'],
})
export class BaseChartComponent {
  @Input() title?: string;
  @Input() loading = false;
  @Input() options: EChartOption | null = null;
  @Input() height = 320;

  get isEmpty(): boolean {
    if (!this.options) {
      return true;
    }
    const series = (this.options as any).series || [];
    return Array.isArray(series) && series.every((s: any) => !s.data || !s.data.length);
  }
}
