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

    // Horizontal bar (category = y-axis): name at the END so it sits above the
    // chart and never overlaps long category labels like "Checkin Counter".
    // Vertical bar (category = x-axis): name centered BELOW tick labels so it
    // doesn't collide with the rightmost bar label.
    const categoryAxis = {
      ...CHART_CATEGORY_AXIS,
      data: names,
      name: categoryName || undefined,
      nameLocation: horizontal ? ('end' as const) : ('middle' as const),
      nameGap: horizontal ? 12 : 38,
      nameTextStyle: horizontal
        ? { ...nameTextStyle, align: 'left' as const, padding: [0, 0, 0, -4] as [number, number, number, number] }
        : nameTextStyle,
      axisLabel: { ...CHART_CATEGORY_AXIS.axisLabel, rotate: 0 },
    };
    // Value-axis name is centered along the axis; on vertical bars we rotate
    // it 90° so it reads along the y-axis without stealing horizontal space.
    const valueAxis = {
      ...CHART_VALUE_AXIS,
      name: valueName || undefined,
      nameLocation: 'middle' as const,
      nameGap: horizontal ? 36 : 58,
      nameRotate: horizontal ? 0 : 90,
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
        top: showLegend ? 40 : (horizontal && categoryName ? 32 : CHART_BASE.grid.top),
        bottom: horizontal ? (valueName ? 48 : 32) : (categoryName ? 64 : 40),
        left: horizontal ? CHART_BASE.grid.left : (valueName ? 56 : CHART_BASE.grid.left),
        right: CHART_BASE.grid.right,
      },
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series: chartSeries,
    } as EChartsOption;
  });
}
