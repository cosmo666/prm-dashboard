import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';

/**
 * One cell in a categorical 2D heatmap.
 * `x` / `y` MUST exist in the parent's `xLabels` / `yLabels`; the wrapper
 * resolves their grid position via `indexOf` (echarts heatmap series wants
 * `[xIndex, yIndex, value]` triples).
 */
export interface HeatmapCell { x: string; y: string; value: number; }

@Component({
  selector: 'app-heatmap-chart',
  templateUrl: './heatmap-chart.component.html',
})
export class HeatmapChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() cells: HeatmapCell[] = [];
  @Input() xLabels: string[] = [];
  @Input() yLabels: string[] = [];
  @Input() loading = false;
  @Input() height = 320;

  @Output() cellClick = new EventEmitter<HeatmapCell>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    const xs = this.xLabels;
    const ys = this.yLabels;
    const cells = this.cells || [];

    // echarts heatmap data: [xIndex, yIndex, value] triples. Cells whose
    // labels aren't in the axis lists are silently dropped — defensive
    // because the parent should always pass aligned axes, but if it doesn't
    // we still want the chart to render the rest.
    const data: Array<[number, number, number]> = [];
    let max = 0;
    for (const c of cells) {
      const xi = xs.indexOf(c.x);
      const yi = ys.indexOf(c.y);
      if (xi < 0 || yi < 0) { continue; }
      data.push([xi, yi, c.value]);
      if (c.value > max) { max = c.value; }
    }

    this.options = {
      tooltip: {
        position: 'top',
        // tslint:disable-next-line: no-any
        formatter: (p: any) => {
          const x = xs[p.data[0]];
          const y = ys[p.data[1]];
          const v = p.data[2];
          return `${y} · ${x}<br/><strong>${v}</strong>`;
        },
      },
      grid: { left: 80, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'category',
        data: xs,
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: ys,
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      visualMap: {
        min: 0,
        // visualMap min === max collapses to a single colour in echarts —
        // ensure the gradient always has a positive range.
        max: max || 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        // Light → dark blue. Mirrors main's palette and stays readable on
        // both light and dark themes.
        inRange: { color: ['#e0f2fe', '#0369a1'] },
        textStyle: { fontSize: 11, color: '#64748b' },
      } as any,
      series: [{
        type: 'heatmap',
        data,
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.2)' },
        },
      } as any],
    };
  }

  // tslint:disable-next-line: no-any
  onChartClick(event: any): void {
    if (!event || !event.data) { return; }
    const xi = event.data[0];
    const yi = event.data[1];
    const v = event.data[2];
    if (typeof xi !== 'number' || typeof yi !== 'number') { return; }
    const x = this.xLabels[xi];
    const y = this.yLabels[yi];
    if (x === undefined || y === undefined) { return; }
    this.cellClick.emit({ x, y, value: v });
  }
}
