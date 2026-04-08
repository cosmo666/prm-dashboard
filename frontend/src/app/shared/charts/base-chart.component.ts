import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption } from 'echarts';

@Component({
  selector: 'app-base-chart',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  template: `
    <div class="chart-container" [class.loading]="loading()">
      <div *ngIf="title()" class="chart-title">{{ title() }}</div>
      <div class="chart-body">
        <div *ngIf="loading()" class="skeleton">Loading...</div>
        <div *ngIf="!loading() && isEmpty()" class="empty-state">No data matches current filters</div>
        <div *ngIf="!loading() && !isEmpty()"
             echarts
             [options]="options()"
             [autoResize]="true"
             (chartClick)="chartClick.emit($event)"
             class="echart"></div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container { background: #fff; border-radius: 12px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.05); height: 100%; display: flex; flex-direction: column; }
    .chart-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: #333; }
    .chart-body { flex: 1; position: relative; min-height: 200px; }
    .echart { width: 100%; height: 100%; min-height: 200px; }
    .skeleton { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; animation: shimmer 1.4s infinite; }
    .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 0.9rem; }
    @keyframes shimmer { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
  `],
})
export class BaseChartComponent {
  title    = input<string>('');
  options  = input.required<EChartsOption>();
  loading  = input<boolean>(false);
  isEmpty  = input<boolean>(false);
  chartClick = output<any>();
}
