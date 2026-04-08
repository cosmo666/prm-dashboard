import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_PALETTE, CHART_COLORS } from '../chart-theme';

export interface SankeyNode { name: string; }
export interface SankeyLink { source: string; target: string; value: number; }

@Component({
  selector: 'app-sankey-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [subtitle]="subtitle()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="links().length === 0"></app-base-chart>
  `,
})
export class SankeyChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  nodes = input.required<SankeyNode[]>();
  links = input.required<SankeyLink[]>();
  loading = input<boolean>(false);

  chartOptions = computed<EChartsOption>(() => {
    const coloredNodes = this.nodes().map((n, i) => ({
      name: n.name,
      itemStyle: { color: CHART_PALETTE[i % CHART_PALETTE.length] },
    }));

    return {
      ...CHART_BASE,
      tooltip: {
        ...CHART_BASE.tooltip,
        trigger: 'item',
        triggerOn: 'mousemove',
      },
      series: [
        {
          type: 'sankey',
          data: coloredNodes,
          links: this.links(),
          left: 12,
          right: 100,
          top: 16,
          bottom: 16,
          nodeWidth: 8,
          nodeGap: 12,
          nodeAlign: 'justify',
          emphasis: { focus: 'adjacency' },
          lineStyle: {
            curveness: 0.55,
            opacity: 0.2,
            color: 'gradient',
          },
          itemStyle: { borderWidth: 0 },
          label: {
            fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
            fontSize: 10,
            fontWeight: 500,
            color: CHART_COLORS.ink,
            backgroundColor: 'transparent',
            padding: [2, 6, 2, 6],
            formatter: (p: any) => {
              // Right-align label with value, e.g. "BLR · 128"
              const v = typeof p.value === 'number' ? p.value : (p.data?.value ?? '');
              return v ? `{name|${p.name}}  {val|${v}}` : `{name|${p.name}}`;
            },
            rich: {
              name: {
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                fontWeight: 600,
                color: CHART_COLORS.ink,
              },
              val: {
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 10,
                fontWeight: 400,
                color: CHART_COLORS.muted,
              },
            },
          },
          labelLayout: {
            align: 'left',
          },
          animationDuration: 600,
          animationEasing: 'cubicOut',
        },
      ],
    } as EChartsOption;
  });
}
