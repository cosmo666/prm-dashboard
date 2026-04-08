import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';

export interface SankeyNode { name: string; }
export interface SankeyLink { source: string; target: string; value: number; }

@Component({
  selector: 'app-sankey-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `<app-base-chart [title]="title()" [options]="chartOptions()" [loading]="loading()" [isEmpty]="links().length === 0"></app-base-chart>`,
})
export class SankeyChartComponent {
  title   = input<string>('');
  nodes   = input.required<SankeyNode[]>();
  links   = input.required<SankeyLink[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => ({
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey',
      data: this.nodes(),
      links: this.links(),
      emphasis: { focus: 'adjacency' },
      lineStyle: { color: 'gradient', curveness: 0.5 },
      label: { formatter: '{b}' },
      animationDuration: 300,
    }],
  }));
}
