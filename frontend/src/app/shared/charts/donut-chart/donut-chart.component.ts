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
        radius: ['60%', '80%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { focus: 'series' },
        data: this.data.map(d => ({
          name: d.name,
          value: d.value,
          itemStyle: d.color ? { color: d.color } : undefined,
        })),
      } as any],
      // Center text: bigger total + small "TOTAL" label, both anchored at the
      // exact donut center via textAlign/textVerticalAlign so the alignment
      // doesn't drift with chart resizes. Group element keeps the two texts
      // glued together as the chart container reflows.
      graphic: [
        {
          type: 'group',
          left: '35%',
          top: 'middle',
          children: [
            {
              type: 'text',
              top: -12,
              style: {
                text: total.toLocaleString(),
                textAlign: 'center',
                textVerticalAlign: 'middle',
                fontSize: 22,
                fontWeight: 600,
                fontFamily: '"Fira Sans", sans-serif',
                fill: '#0f172a',
              },
            },
            {
              type: 'text',
              top: 14,
              style: {
                text: 'TOTAL',
                textAlign: 'center',
                textVerticalAlign: 'middle',
                fontSize: 10,
                fontFamily: '"Fira Code", ui-monospace, monospace',
                fontWeight: 500,
                fill: '#64748b',
              },
            },
          ],
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
