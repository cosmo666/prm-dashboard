import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_PALETTE, CHART_COLORS } from '../chart-theme';

export interface DonutDatum { name: string; value: number; color?: string; }

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [subtitle]="subtitle()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="segmentClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class DonutChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  data = input.required<DonutDatum[]>();
  loading = input<boolean>(false);
  segmentClick = output<string>();

  chartOptions = computed<EChartsOption>(() => {
    const data = this.data().map((d, i) => ({
      name: d.name,
      value: d.value,
      itemStyle: { color: d.color ?? CHART_PALETTE[i % CHART_PALETTE.length] },
    }));

    return {
      ...CHART_BASE,
      tooltip: {
        ...CHART_BASE.tooltip,
        trigger: 'item',
        formatter: '{b}: <strong>{c}</strong> ({d}%)',
      },
      legend: {
        ...CHART_BASE.legend,
        orient: 'horizontal',
        top: 0,
        left: 0,
      },
      series: [
        {
          type: 'pie',
          radius: ['54%', '76%'],
          center: ['50%', '58%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: CHART_COLORS.surface,
            borderWidth: 2,
            borderRadius: 2,
          },
          label: {
            show: false,
          },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 4,
            label: {
              show: true,
              fontSize: 18,
              fontFamily: '"Fraunces", serif',
              fontWeight: 300,
              color: CHART_COLORS.ink,
              formatter: '{d}%',
            },
          },
          data,
          animationDuration: 500,
          animationEasing: 'cubicOut',
        },
      ],
    } as EChartsOption;
  });
}
