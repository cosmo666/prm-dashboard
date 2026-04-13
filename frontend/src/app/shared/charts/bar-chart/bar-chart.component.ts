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
  lineSeries = input<BarDatum[]>([]);
  lineSeriesName = input<string>('');
  lineSeriesColor = input<string>('#dc2626');
  unit = input<string>('');

  private formatNumber(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '—';
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  private formatTick(v: number | null | undefined): string {
    const num = this.formatNumber(v);
    return this.unit() === '%' ? `${num}%` : num;
  }

  private formatValue(v: number | null | undefined): string {
    const num = this.formatNumber(v);
    const u = this.unit();
    if (!u) return num;
    return u === '%' ? `${num}%` : `${num} ${u}`;
  }

  chartOptions = computed<EChartsOption>(() => {
    const d = this.data();
    const d2 = this.series2();
    const names = d.map((x) => x.label);
    const values = d.map((x) => ({
      value: x.value,
      itemStyle: x.color ? { color: x.color } : undefined,
    }));

    const horizontal = this.horizontal();
    const categoryName = horizontal ? this.yLabel() : this.xLabel();
    const valueName = horizontal ? this.xLabel() : this.yLabel();
    const nameTextStyle = { color: CHART_COLORS.muted, fontSize: 11, fontWeight: 600 as const };

    const categoryAxis = {
      ...CHART_CATEGORY_AXIS,
      data: names,
      name: categoryName || undefined,
      nameLocation: 'middle' as const,
      nameGap: horizontal ? 64 : 32,
      nameTextStyle,
      axisLabel: { ...CHART_CATEGORY_AXIS.axisLabel, rotate: 0 },
    };
    const valueAxis = {
      ...CHART_VALUE_AXIS,
      name: valueName || undefined,
      nameLocation: 'middle' as const,
      nameGap: horizontal ? 28 : 52,
      nameTextStyle,
      axisLabel: {
        ...CHART_VALUE_AXIS.axisLabel,
        formatter: (v: number) => this.formatTick(v),
      },
    };

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

    const ls = this.lineSeries();
    if (ls.length > 0) {
      chartSeries.push({
        name: this.lineSeriesName() || undefined,
        type: 'line',
        data: ls.map((x) => x.value),
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: this.lineSeriesColor(), width: 2 },
        itemStyle: { color: this.lineSeriesColor() },
        z: 5,
        animationDuration: 400,
      });
    }

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

    const hasLine = ls.length > 0;
    const showLegend = hasLine || isGrouped;

    return {
      ...CHART_BASE,
      tooltip: {
        ...CHART_BASE.tooltip,
        trigger: hasLine ? 'axis' : 'item',
        valueFormatter: (v: any) => this.formatValue(Number(v)),
      },
      legend: showLegend ? CHART_BASE.legend : { show: false },
      grid: {
        ...CHART_BASE.grid,
        top: showLegend ? 32 : CHART_BASE.grid.top,
        bottom: horizontal ? (categoryName ? 44 : 32) : (valueName || categoryName ? 64 : 56),
        left: horizontal ? (valueName ? 64 : CHART_BASE.grid.left) : (valueName ? 64 : CHART_BASE.grid.left),
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: chartSeries,
    } as EChartsOption;
  });
}
