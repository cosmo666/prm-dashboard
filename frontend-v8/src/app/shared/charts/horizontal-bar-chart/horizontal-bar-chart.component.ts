import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';
import {
  CHART_TOOLTIP,
  CROSS_AXIS_POINTER,
  CHART_LEGEND_TOP_LEFT,
  VALUE_AXIS_WITH_GRID,
  CATEGORY_AXIS,
} from '../chart-theme';

export interface BarDatum { label: string; value: number; }

@Component({
  selector: 'app-horizontal-bar-chart',
  templateUrl: './horizontal-bar-chart.component.html',
})
export class HorizontalBarChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() data: BarDatum[] = [];
  @Input() loading = false;
  @Input() height = 380;
  @Input() secondaryData?: BarDatum[];
  @Input() primaryLabel = 'Serviced';
  @Input() secondaryLabel = 'Requested (gap)';

  // Display-only axis labels + tooltip unit. In horizontal mode the value
  // axis is x, the categorical axis is y — xLabel/yLabel match that
  // convention.
  @Input() xLabel = '';
  @Input() yLabel = '';
  @Input() unit = '';

  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;
  private topRows: BarDatum[] = [];

  ngOnChanges(): void {
    this.topRows = this.data.slice(0, 10);
    const hasSecondary = !!(this.secondaryData && this.secondaryData.length > 0);
    const secondaryRows = hasSecondary ? (this.secondaryData as BarDatum[]).slice(0, this.topRows.length) : [];

    const primary = resolvePrimary();

    const series: any[] = [{
      name: this.primaryLabel,
      type: 'bar',
      stack: 'rank',
      data: this.topRows.map(d => d.value),
      barMaxWidth: 24,
      barCategoryGap: '20%',
      itemStyle: { color: primary },
      emphasis: { focus: 'series' },
    }];

    if (hasSecondary) {
      series.push({
        name: this.secondaryLabel,
        type: 'bar',
        stack: 'rank',
        data: secondaryRows.map(d => d.value),
        barMaxWidth: 24,
        itemStyle: { color: primary, opacity: 0.30 },
        emphasis: { focus: 'series' },
      });
    }

    const tickFormatter = this.unit === '%'
      ? ((v: number) => v + '%')
      : undefined;
    // echarts 4 lacks tooltip.valueFormatter — emulate via the legacy formatter callback.
    const unit = this.unit;
    // tslint:disable-next-line: no-any
    const tooltipFormatter = unit
      // tslint:disable-next-line: no-any
      ? ((params: any) => {
          const arr = Array.isArray(params) ? params : [params];
          const lines = arr.map((p: any) => {
            const v = p.value && p.value.value !== undefined ? p.value.value : p.value;
            const formatted = unit === '%' ? `${v}%` : `${v} ${unit}`;
            return `${p.marker || ''}${p.seriesName || ''}: <strong>${formatted}</strong>`;
          });
          const header = arr[0] && arr[0].name ? arr[0].name + '<br/>' : '';
          return header + lines.join('<br/>');
        })
      : undefined;

    this.options = {
      tooltip: {
        ...CHART_TOOLTIP,
        trigger: 'axis',
        axisPointer: CROSS_AXIS_POINTER,
        formatter: tooltipFormatter,
      },
      legend: hasSecondary
        ? { ...CHART_LEGEND_TOP_LEFT, data: [this.primaryLabel, this.secondaryLabel] }
        : undefined,
      grid: { left: 100, right: 30, top: hasSecondary ? 36 : 20, bottom: this.xLabel ? 50 : 30 },
      // x-axis is the value axis (horizontal bars), so apply the dashed
      // split-line treatment here. y-axis is categorical (row labels).
      xAxis: {
        ...VALUE_AXIS_WITH_GRID,
        name: this.xLabel || undefined,
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: tickFormatter
          ? { ...VALUE_AXIS_WITH_GRID.axisLabel, formatter: tickFormatter }
          : VALUE_AXIS_WITH_GRID.axisLabel,
      },
      yAxis: {
        ...CATEGORY_AXIS,
        data: this.topRows.map(d => d.label),
        inverse: true,
        axisLabel: { ...CATEGORY_AXIS.axisLabel, fontSize: 11 },
        name: this.yLabel || undefined,
        nameLocation: 'end',
        nameGap: 12,
      },
      series,
    };
  }

  onChartClick(event: any): void {
    if (!event) { return; }
    const category = (event.name as string) || (event.data && event.data.name);
    if (category) {
      const row = this.topRows.find(r => r.label === category);
      this.barClick.emit({ category, value: row ? row.value : (event.value as number) || 0 });
    }
  }
}
