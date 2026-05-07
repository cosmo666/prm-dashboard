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
      // `tooltip.position: 'top'` forces the tooltip to sit ABOVE the
      // anchor point regardless of where the cursor is, instead of
      // tracking the cursor. Combined with `confine: true` to keep it
      // inside the chart container, this stops the tooltip from
      // covering the segment-value labels (e.g. "485") that we paint
      // outside each slice.
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        position: 'top',
        confine: true,
      },
      legend:  { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['58%', '78%'],
        // Anchor the donut at the GEOMETRIC center of the chart's left
        // ~70% (the legend takes the right). 35% horizontal puts the
        // donut squarely inside the bordered area; the graphic-text
        // center coordinates below MUST match this exactly.
        center: ['35%', '50%'],
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
      // Center text: echarts 4 positions a graphic.text element by its
      // TOP-LEFT corner when given absolute `left`/`top`, regardless of
      // `textAlign`/`textVerticalAlign`. To put the geometric center of
      // each text element at the donut's [35%, 50%] anchor, we use the
      // `position: ['35%', '50%']` array form — this DOES respect
      // textAlign/textVerticalAlign and uses them as the anchor mode.
      // Two stacked text elements offset by ±10px on the y-axis.
      graphic: [
        {
          type: 'text',
          position: ['35%', '50%'],
          z: 100,
          style: {
            text: total.toLocaleString(),
            textAlign: 'center',
            textVerticalAlign: 'middle',
            y: -10,
            fontSize: 22,
            fontWeight: 600,
            fontFamily: '"Fira Sans", sans-serif',
            fill: '#0f172a',
          },
        } as any,
        {
          type: 'text',
          position: ['35%', '50%'],
          z: 100,
          style: {
            text: 'TOTAL',
            textAlign: 'center',
            textVerticalAlign: 'middle',
            y: 14,
            fontSize: 10,
            fontFamily: '"Fira Code", ui-monospace, monospace',
            fontWeight: 500,
            fill: '#64748b',
          },
        } as any,
      ],
    };
  }

  onChartClick(event: any): void {
    if (event && event.data && typeof event.data.name === 'string') {
      this.segmentClick.emit({ name: event.data.name, value: event.data.value });
    }
  }
}
