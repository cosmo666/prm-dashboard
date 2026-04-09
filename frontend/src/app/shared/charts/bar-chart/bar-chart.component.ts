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
  series2 = input<BarDatum[]>([]);
  seriesName = input<string>('');
  series2Name = input<string>('');
  series2Color = input<string>('#fb8c00');

  chartOptions = computed<EChartsOption>(() => {
    const d = this.data();
    const d2 = this.series2();
    const names = d.map((x) => x.label);
    const values = d.map((x) => ({
      value: x.value,
      itemStyle: x.color ? { color: x.color } : undefined,
    }));

    const categoryAxis = {
      ...CHART_CATEGORY_AXIS,
      data: names,
      axisLabel: { ...CHART_CATEGORY_AXIS.axisLabel, rotate: 0 },
    };
    const valueAxis = { ...CHART_VALUE_AXIS };

    const isGrouped = d2.length > 0;

    const chartSeries: any[] = [
      {
        name: this.seriesName() || undefined,
        type: 'bar',
        data: values,
        barMaxWidth: isGrouped ? 20 : 32,
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
    ];

    if (isGrouped) {
      chartSeries.push({
        name: this.series2Name() || undefined,
        type: 'bar',
        data: d2.map((x) => ({
          value: x.value,
          itemStyle: x.color ? { color: x.color } : undefined,
        })),
        barMaxWidth: 20,
        itemStyle: {
          color: this.series2Color(),
          borderRadius: this.horizontal() ? [0, 3, 3, 0] : [3, 3, 0, 0],
        },
        emphasis: {
          itemStyle: { color: this.series2Color() },
        },
        animationDuration: 400,
        animationEasing: 'cubicOut',
      });
    }

    return {
      ...CHART_BASE,
      grid: { ...CHART_BASE.grid, bottom: this.horizontal() ? 32 : 56 },
      xAxis: this.horizontal() ? valueAxis : categoryAxis,
      yAxis: this.horizontal() ? categoryAxis : valueAxis,
      series: chartSeries,
    } as EChartsOption;
  });
}
