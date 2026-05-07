import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';

export interface DonutDatum { name: string; value: number; color?: string; }

@Component({
  selector: 'app-donut-chart',
  templateUrl: './donut-chart.component.html',
})
export class DonutChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() data: DonutDatum[] = [];
  @Input() loading = false;
  @Input() height = 320;
  @Output() segmentClick = new EventEmitter<{ name: string; value: number }>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    const total = this.data.reduce((a, b) => a + b.value, 0);
    this.options = {
      // Tooltip pinned to the chart's top-left corner so it never overlaps
      // the segment-value labels (which already show count + pct outside
      // each slice). Keeps interaction feedback discoverable without
      // duplicating visible information at the same position.
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        position: [8, 8],
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'rgba(15, 23, 42, 0.92)',
        textStyle: { color: '#f8fafc', fontSize: 11, fontFamily: '"Fira Sans", sans-serif' },
        padding: [6, 10],
        extraCssText: 'border-radius: 6px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);',
      },
      // Legend at the top — horizontal — frees the donut to center
      // horizontally at exactly 50%. Layout matches main's pattern.
      legend: {
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        textStyle: { fontSize: 12 },
        itemGap: 18,
      },
      // Two-line center label rendered via the `title` component — the
      // ONE positioning surface in echarts 4 that reliably anchors text
      // dead-center via `left: 'center', top: 'middle'`. `subtext`
      // becomes the smaller "TOTAL" caption below the count.
      title: {
        text: total.toLocaleString(),
        subtext: 'TOTAL',
        left: 'center',
        top: '42%',
        textAlign: 'center',
        textStyle: {
          fontSize: 22,
          fontWeight: 600,
          fontFamily: '"Fira Sans", sans-serif',
          color: '#0f172a',
        },
        subtextStyle: {
          fontSize: 10,
          fontWeight: 500,
          fontFamily: '"Fira Code", ui-monospace, monospace',
          color: '#64748b',
        },
        itemGap: 6,
      } as any,
      series: [{
        type: 'pie',
        radius: ['58%', '78%'],
        // Centered horizontally; nudge slightly up of vertical center
        // so the segment value labels don't crowd the legend at the
        // bottom.
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        // Show value + percentage outside each segment so the user sees
        // the breakdown at a glance without hovering.
        label: {
          show: true,
          position: 'outside',
          formatter: '{c} ({d}%)',
          fontFamily: '"Fira Code", ui-monospace, monospace',
          fontSize: 11,
          color: '#0f172a',
        },
        labelLine: { show: true, length: 6, length2: 4, smooth: true, lineStyle: { color: '#cbd5e1' } },
        emphasis: { focus: 'series', label: { fontSize: 12, fontWeight: 'bold' } },
        data: this.data.map(d => ({
          name: d.name,
          value: d.value,
          itemStyle: d.color ? { color: d.color } : undefined,
        })),
      } as any],
    };
  }

  onChartClick(event: any): void {
    if (event && event.data && typeof event.data.name === 'string') {
      this.segmentClick.emit({ name: event.data.name, value: event.data.value });
    }
  }
}
