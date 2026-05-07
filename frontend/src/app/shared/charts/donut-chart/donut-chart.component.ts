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
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend:  { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        // Show value + percentage outside each segment so the user sees
        // the breakdown at a glance without hovering.
        label: {
          show: true,
          position: 'outside',
          formatter: '{c}',
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
      // Center text: positioning each text element with `top: '50%'` plus
      // `textVerticalAlign: 'middle'` anchors the text's vertical CENTER at
      // the 50% line — survives container resizes. Stacked rows offset
      // ±10px so the number sits above the "TOTAL" caption.
      graphic: [
        {
          type: 'text',
          left: '35%',
          top: '46%',
          style: {
            text: total.toLocaleString(),
            textAlign: 'center',
            textVerticalAlign: 'middle',
            fontSize: 22,
            fontWeight: 600,
            fontFamily: '"Fira Sans", sans-serif',
            fill: '#0f172a',
          },
        } as any,
        {
          type: 'text',
          left: '35%',
          top: '58%',
          style: {
            text: 'TOTAL',
            textAlign: 'center',
            textVerticalAlign: 'middle',
            fontSize: 10,
            fontFamily: '"Fira Code", ui-monospace, monospace',
            fontWeight: 500,
            letterSpacing: 1,
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
