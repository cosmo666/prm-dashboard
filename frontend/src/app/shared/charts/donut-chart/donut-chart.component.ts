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
      // Hover tooltip removed — the segment-value labels we paint outside
      // each slice already show "{count} ({pct}%)" at all times, making
      // a hover tooltip redundant and visually noisy.
      tooltip: { show: false },
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
        // Hover emphasis: keep the slice STATIC — no scale/expand — and
        // don't restyle the label, otherwise the expanding slice clips its
        // own value label and the connector line. A subtle border-tint on
        // the hovered slice is enough hover feedback.
        emphasis: {
          scale: false,
          scaleSize: 0,
          focus: 'none',
          label: { show: true, fontSize: 11, fontWeight: 'normal', color: '#0f172a' },
          itemStyle: { borderColor: '#0f172a', borderWidth: 2 },
        },
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
