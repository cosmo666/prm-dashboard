import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import * as echarts from 'echarts';
import { DailyTrendResponse } from 'src/app/features/dashboard/services/prm-dtos';
import { resolvePrimary } from '../resolve-primary';

@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.component.html',
})
export class LineChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() trend: DailyTrendResponse | null = null;
  /**
   * Period-over-period overlay (OQ-P1-3). When non-null and non-empty, the chart
   * renders a second dotted line at 0.35 opacity in the primary hue. Hidden when
   * null or when values.length === 0 (very short ranges or first-month tenants).
   */
  @Input() secondarySeries: DailyTrendResponse | null = null;
  @Input() loading = false;
  @Input() height = 320;
  @Output() pointClick = new EventEmitter<string>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    if (!this.trend) { this.options = null; return; }
    const primary = resolvePrimary();
    const hasPrev = !!(this.secondarySeries && this.secondarySeries.values && this.secondarySeries.values.length > 0);

    const series: any[] = [{
      name: 'Current',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      data: this.trend.values,
      itemStyle: { color: primary },
      lineStyle:  { color: primary, width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: this.alphaHex(primary, 0.25) },
          { offset: 1, color: this.alphaHex(primary, 0.0) },
        ]),
      },
      markLine: {
        symbol: 'none',
        data: [{
          yAxis: this.trend.average,
          lineStyle: { type: 'dashed', color: '#94a3b8' },
          label: { formatter: `Avg ${this.trend.average.toFixed(0)}`, position: 'end' as const },
        }],
      },
    }];

    if (hasPrev) {
      // Render the prev-period values point-for-point against the current period's
      // x-axis. The OverviewTabComponent ensures lengths align; if the prev array
      // is shorter (e.g. month boundary), we right-pad with the last known value
      // so the line spans the full axis without an abrupt drop.
      const prev = (this.secondarySeries as DailyTrendResponse).values.slice(0, this.trend.values.length);
      while (prev.length < this.trend.values.length) {
        prev.push(prev[prev.length - 1] || 0);
      }
      series.push({
        name: 'Prev period',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: prev,
        itemStyle: { color: primary, opacity: 0.35 },
        lineStyle: { color: primary, width: 1.5, type: 'dotted', opacity: 0.35 },
      });
    }

    this.options = {
      tooltip: { trigger: 'axis' },
      legend:  hasPrev ? { data: ['Current', 'Prev period'], right: 0, top: 0, textStyle: { color: '#64748b' } } : undefined,
      grid:    { left: 40, right: 20, top: hasPrev ? 40 : 30, bottom: 40 },
      xAxis: { type: 'category', data: this.trend.dates, axisLine: { lineStyle: { color: '#cbd5e1' } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e2e8f0' } } },
      series,
    };
  }

  /** Crude alpha-blend for hex/oklch primary. echarts area gradients want hex/rgba. */
  private alphaHex(color: string, alpha: number): string {
    // If color is in rgb()/rgba() or oklch(), wrap with rgba via canvas; cheap path: assume #RRGGBB
    if (color[0] === '#' && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    return color;
  }

  onChartClick(event: any): void {
    if (event && event.name) { this.pointClick.emit(event.name); }
  }
}
