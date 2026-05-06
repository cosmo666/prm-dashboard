import { Component, Input, Output, EventEmitter } from '@angular/core';
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

  /**
   * Re-emit echarts (chartClick) so chart wrappers can wire drill-down (OQ-P1-2).
   * ngx-echarts 5.2.2 emits a `chartClick` event from its [echarts] directive when
   * the user clicks a series item — we surface that through the shared chart shell
   * so feature components don't need to reach into echarts directly.
   */
  @Output() chartClick = new EventEmitter<any>();

  get isEmpty(): boolean {
    if (!this.options) {
      return true;
    }
    const series = (this.options as any).series || [];
    return Array.isArray(series) && series.every((s: any) => !s.data || !s.data.length);
  }
}
