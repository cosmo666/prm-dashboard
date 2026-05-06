import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';

export interface BarDatum { label: string; value: number; }

@Component({
  selector: 'app-horizontal-bar-chart',
  templateUrl: './horizontal-bar-chart.component.html',
})
export class HorizontalBarChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() data: BarDatum[] = [];
  @Input() loading = false;
  @Input() height = 380;
  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;
  private topRows: BarDatum[] = [];

  ngOnChanges(): void {
    this.topRows = this.data.slice(0, 10);
    this.options = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid:    { left: 100, right: 30, top: 20, bottom: 30 },
      xAxis:   { type: 'value' },
      yAxis:   { type: 'category', data: this.topRows.map(d => d.label), inverse: true, axisLabel: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: this.topRows.map(d => d.value),
        barMaxWidth: 24,
        barCategoryGap: '20%',
        itemStyle: { color: this.resolvePrimary() },
        emphasis: { focus: 'series' },
      }] as any,
    };
  }

  onChartClick(event: any): void {
    if (!event) { return; }
    const category = (event.name as string) || (event.data && event.data.name);
    if (category) {
      const row = this.topRows.find(r => r.label === category);
      this.barClick.emit({ category, value: row ? row.value : (event.value as number) || 0 });
    }
  }

  private resolvePrimary(): string {
    if (typeof document === 'undefined') { return '#2563EB'; }
    const v = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
    return v || '#2563EB';
  }
}
