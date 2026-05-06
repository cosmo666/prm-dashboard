import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

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
  @Input() secondaryData?: BarDatum[];
  @Input() primaryLabel = 'Serviced';
  @Input() secondaryLabel = 'Requested (gap)';
  @Output() barClick = new EventEmitter<{ category: string; value: number }>();

  options: EChartOption | null = null;
  private topRows: BarDatum[] = [];

  ngOnChanges(): void {
    this.topRows = this.data.slice(0, 10);
    const hasSecondary = !!(this.secondaryData && this.secondaryData.length > 0);
    const secondaryRows = hasSecondary ? (this.secondaryData as BarDatum[]).slice(0, this.topRows.length) : [];

    const primary = resolvePrimary();

    const series: any[] = [{
      name: this.primaryLabel,
      type: 'bar',
      stack: 'rank',
      data: this.topRows.map(d => d.value),
      barMaxWidth: 24,
      barCategoryGap: '20%',
      itemStyle: { color: primary },
      emphasis: { focus: 'series' },
    }];

    if (hasSecondary) {
      series.push({
        name: this.secondaryLabel,
        type: 'bar',
        stack: 'rank',
        data: secondaryRows.map(d => d.value),
        barMaxWidth: 24,
        itemStyle: { color: primary, opacity: 0.30 },
        emphasis: { focus: 'series' },
      });
    }

    this.options = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend:  hasSecondary ? { data: [this.primaryLabel, this.secondaryLabel], right: 0, top: 0 } : undefined,
      grid:    { left: 100, right: 30, top: hasSecondary ? 40 : 20, bottom: 30 },
      xAxis:   { type: 'value' },
      yAxis:   { type: 'category', data: this.topRows.map(d => d.label), inverse: true, axisLabel: { fontSize: 11 } },
      series,
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
}
