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
  // Optional override for the centered total. When the donut shows only a
  // SUBSET of segments (e.g. top-5 service types out of 9), the caller can
  // pass the full population total here so the centre number reflects the
  // whole dataset rather than just the rendered segments.
  @Input() centerTotal?: number;
  // Optional caption rendered below the centre number (e.g. "OF 575",
  // "TOP 5"). Empty string suppresses it for the cleanest single-number
  // centring — no caption means the bounding box collapses to one line and
  // `top: 'middle'` centres the number perfectly.
  @Input() centerCaption = '';
  @Output() segmentClick = new EventEmitter<{ name: string; value: number }>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    // Use the override if provided, otherwise sum the rendered segments.
    const sumOfSegments = this.data.reduce((a, b) => a + b.value, 0);
    const total = (this.centerTotal !== undefined && this.centerTotal !== null)
      ? this.centerTotal
      : sumOfSegments;
    this.options = {
      // Hover tooltip removed — the segment-value labels we paint outside
      // each slice already show "{count} ({pct}%)" at all times, making
      // a hover tooltip redundant and visually noisy.
      tooltip: { show: false },
      // Legend at the top — horizontal — frees the donut to center
      // horizontally at exactly 50%. Layout matches main's pattern.
      legend: {
        orient: 'horizontal',
        // `4%` clears below the donut + outside-segment labels without
        // creeping into them. `bottom: 0` was clipping at the chart edge.
        bottom: '4%',
        left: 'center',
        textStyle: { fontSize: 12 },
        itemGap: 18,
      },
      // Centre label. When NO caption is supplied, the title is a single
      // text element — `top: 'middle'` centres ITS geometric centre at
      // the chart's geometric centre, so the big number lands exactly on
      // the donut's centre line.
      // When a caption IS supplied, render it as `subtext` below the
      // number, accepting that the bounding-box-centred title will sit
      // a few px above the donut's centre — visible but the big number
      // remains anchored to the chart's vertical midline.
      title: this.centerCaption
        ? {
            text: total.toLocaleString(),
            subtext: this.centerCaption,
            left: 'center',
            top: 'middle',
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
            itemGap: 4,
          } as any
        : {
            text: total.toLocaleString(),
            left: 'center',
            top: 'middle',
            textAlign: 'center',
            textStyle: {
              fontSize: 24,
              fontWeight: 600,
              fontFamily: '"Fira Sans", sans-serif',
              color: '#0f172a',
            },
          } as any,
      series: [{
        type: 'pie',
        // Slightly tighter ring so the segment value labels outside the
        // slices have room to breathe before colliding with the chart edge.
        radius: ['54%', '74%'],
        // Dead center — matches title's anchor exactly. The bottom legend
        // (legend.bottom: 4%) sits below the chart with enough clearance.
        center: ['50%', '50%'],
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
