import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { CHART_TOOLTIP, CHART_COLORS } from '../chart-theme';

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
        ...CHART_TOOLTIP,
        position: 'top',
        // tslint:disable-next-line: no-any
        formatter: (p: any) => {
          const x = xs[p.data[0]];
          const y = ys[p.data[1]];
          const v = p.data[2];
          return `${y} · ${x}<br/><strong>${v}</strong>`;
        },
      },
      grid: { left: 60, right: 20, top: 16, bottom: 48, containLabel: true },
      // Cleaner axes — no axis line, no tick marks, no checkered grid
      // behind the cells. The colored cells themselves carry the grid
      // structure visually.
      xAxis: {
        type: 'category',
        data: xs,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.muted,
          fontFamily: '"Fira Sans", sans-serif',
          fontSize: 10,
        },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: ys,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.muted,
          fontFamily: '"Fira Sans", sans-serif',
          fontSize: 10,
        },
        splitArea: { show: false },
      },
      visualMap: {
        min: 0,
        // visualMap min === max collapses to a single colour in echarts —
        // ensure the gradient always has a positive range.
        max: max || 1,
        // calculable: false hides the drag handles. The bar is still
        // interactive (hover surfaces a "~N" indicator), but the user
        // can't drag a range out — matches the Angular 17 main version
        // where the visualMap is a static legend with hover affordance.
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 140,
        // Four-stop indigo ramp matching main: stone-100 → indigo-200 →
        // indigo-500 → indigo-900. Reads as "very pale → vivid → deep"
        // so low and high cells are unambiguously distinguishable.
        inRange: {
          color: ['#f5f5f4', '#c7d2fe', '#6366f1', '#312e81'],
        },
        textStyle: {
          fontFamily: '"Fira Sans", sans-serif',
          fontSize: 10,
          color: CHART_COLORS.muted,
        },
      } as any,
      series: [{
        type: 'heatmap',
        data,
        label: { show: false },
        // White cell borders + 2px radius. The borders separate cells
        // crisply on the pale end of the ramp where adjacent cells
        // would otherwise blend.
        itemStyle: {
          borderColor: CHART_COLORS.surface,
          borderWidth: 1,
          borderRadius: 2,
        },
        // Dark ink border on hover — replaces the previous shadowBlur
        // emphasis. Reads cleaner on the indigo ramp and matches main.
        emphasis: {
          itemStyle: {
            borderColor: CHART_COLORS.ink,
            borderWidth: 1,
          },
        },
        progressive: 1000,
        animationDuration: 400,
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
