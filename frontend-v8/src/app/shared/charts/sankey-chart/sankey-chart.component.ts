import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { EChartOption } from 'echarts';
import { resolvePrimary } from '../resolve-primary';

export interface SankeyChartNode { name: string; }
export interface SankeyChartLink { source: string; target: string; value: number; }

@Component({
  selector: 'app-sankey-chart',
  templateUrl: './sankey-chart.component.html',
})
export class SankeyChartComponent implements OnChanges {
  @Input() title?: string;
  @Input() nodes: SankeyChartNode[] = [];
  @Input() links: SankeyChartLink[] = [];
  @Input() loading = false;
  @Input() height = 480;

  /** OQ-P3-3 drill-down: emits node name on node click; link clicks no-op. */
  @Output() nodeClick = new EventEmitter<string>();

  options: EChartOption | null = null;

  ngOnChanges(): void {
    if (!this.nodes.length || !this.links.length) {
      this.options = null;
      return;
    }
    const primary = resolvePrimary();
    this.options = {
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [{
        type: 'sankey',
        data: this.nodes.map(n => ({ name: n.name })),
        links: this.links,
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'left',
        layoutIterations: 32,
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.5 },
        itemStyle: { color: primary, borderColor: primary },
        label: { color: '#0f172a', fontSize: 12 },
      } as any],
    };
  }

  /**
   * echarts emits dataType='node' for node clicks, 'edge' for link clicks.
   * We only act on nodes.
   */
  onChartClick(event: any): void {
    if (!event) { return; }
    if (event.dataType === 'node' && event.name) {
      this.nodeClick.emit(event.name);
    }
  }
}
