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
      graphic: [
        {
          type: 'text', left: '35%', top: '46%',
          style: { text: total.toLocaleString(), textAlign: 'center', fontSize: 22, fontWeight: 500, fill: '#0f172a' },
        },
        {
          type: 'text', left: '35%', top: '60%',
          style: { text: 'TOTAL', textAlign: 'center', fontSize: 10, fill: '#64748b' },
        },
      ],
    };
  }

  onChartClick(event: any): void {
    if (event && event.data && typeof event.data.name === 'string') {
      this.segmentClick.emit({ name: event.data.name, value: event.data.value });
    }
  }
}
