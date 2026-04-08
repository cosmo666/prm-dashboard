import { Component, input, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EChartsOption } from 'echarts';
import { BaseChartComponent } from '../base-chart.component';
import { CHART_BASE, CHART_CATEGORY_AXIS, CHART_VALUE_AXIS, CHART_COLORS } from '../chart-theme';

export interface BarDatum { label: string; value: number; color?: string; }

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule, BaseChartComponent],
  template: `
    <app-base-chart
      [title]="title()"
      [subtitle]="subtitle()"
      [options]="chartOptions()"
      [loading]="loading()"
      [isEmpty]="data().length === 0"
      (chartClick)="barClick.emit($event.name)">
    </app-base-chart>
  `,
})
export class BarChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  data = input.required<BarDatum[]>();
  loading = input<boolean>(false);
  xLabel = input<string>('');
  yLabel = input<string>('');
  horizontal = input<boolean>(false);
  barClick = output<string>();

  chartOptions = computed<EChartsOption>(() => {
    const d = this.data();
    const names = d.map((x) => x.label);
    const values = d.map((x) => ({
      value: x.value,
      itemStyle: x.color ? { color: x.color } : undefined,
    }));

    const categoryAxis = {
      ...CHART_CATEGORY_AXIS,
      data: names,
      axisLabel: { ...CHART_CATEGORY_AXIS.axisLabel, rotate: this.horizontal() ? 0 : 28 },
    };
    const valueAxis = { ...CHART_VALUE_AXIS };

    return {
      ...CHART_BASE,
      grid: { ...CHART_BASE.grid, bottom: this.horizontal() ? 32 : 56 },
      xAxis: this.horizontal() ? valueAxis : categoryAxis,
      yAxis: this.horizontal() ? categoryAxis : valueAxis,
      series: [
        {
          type: 'bar',
          data: values,
          barMaxWidth: 32,
          itemStyle: {
            color: CHART_COLORS.accent,
            borderRadius: this.horizontal() ? [0, 3, 3, 0] : [3, 3, 0, 0],
          },
          emphasis: {
            itemStyle: { color: CHART_COLORS.accentHover },
          },
          animationDuration: 400,
          animationEasing: 'cubicOut',
        },
      ],
    } as EChartsOption;
  });
}
