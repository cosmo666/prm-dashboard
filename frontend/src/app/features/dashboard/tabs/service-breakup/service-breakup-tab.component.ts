import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import {
  SankeyResponse,
  SankeyNode,
  SankeyLink,
  RouteItem,
} from '../../services/prm-dtos';
import { BarDatum } from 'src/app/shared/charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { SankeyChartNode, SankeyChartLink } from 'src/app/shared/charts/sankey-chart/sankey-chart.component';

const SSR_COLORS: { [code: string]: string } = {
  WCHR: '#2563EB',
  WCHC: '#1e3a8a',
  WCHS: '#3b82f6',
  MAAS: '#0ea5e9',
  UMNR: '#8b5cf6',
  DPNA: '#a855f7',
  BLND: '#10b981',
  DEAF: '#22c55e',
  MEDA: '#f59e0b',
};

@Component({
  selector: 'app-service-breakup-tab',
  templateUrl: './service-breakup-tab.component.html',
  styleUrls: ['./service-breakup-tab.component.scss'],
})
export class ServiceBreakupTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(false);

  sankeyNodes$ = new BehaviorSubject<SankeyChartNode[]>([]);
  sankeyLinks$ = new BehaviorSubject<SankeyChartLink[]>([]);

  monthlyMix$ = new BehaviorSubject<BarDatum[]>([]);
  monthlyMixStacked$ = new BehaviorSubject<{ [code: string]: number[] }>({});
  monthlyMixKeys$ = new BehaviorSubject<string[]>([]);
  monthlyMixColors$ = new BehaviorSubject<{ [code: string]: string }>({});

  routes$ = new BehaviorSubject<RouteItem[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          sankey: this.data.serviceBreakupSankey(),
          matrix: this.data.serviceTypeMatrix(),
          routes: this.data.topRoutes(10),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        const capped = this.capSankeyFlights(r.sankey, 10);
        this.sankeyNodes$.next(capped.nodes.map(n => ({ name: n.name })));
        this.sankeyLinks$.next(capped.links);

        const months = r.matrix.rows.map(row => row.monthYear);
        const types = r.matrix.serviceTypes;
        const stacked: { [code: string]: number[] } = {};
        for (const t of types) {
          stacked[t] = r.matrix.rows.map(row => row.serviceCounts[t] || 0);
        }
        this.monthlyMix$.next(months.map(m => ({ label: m, value: 0 })));
        this.monthlyMixStacked$.next(stacked);
        this.monthlyMixKeys$.next(types);
        this.monthlyMixColors$.next(this.colorMapForServices(types));

        this.routes$.next(r.routes.items || []);

        this.loading$.next(false);
      },
      err => {
        console.error('[service-breakup] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * OQ-P3-2: client-side cap on the flight stage. Backend returns ALL distinct
   * flights matching the filter — could be 50+ for a busy tenant — and echarts
   * 4 sankey gets unreadable past ~30 nodes per stage. Keep top n flights by
   * total inbound link weight; aggregate the rest into a single "Other flights"
   * pseudo-node.
   *
   * Heuristic: a node is a flight if it never appears as a link.source (it's
   * stage 3, the leaf). Stages 1 (agent type) and 2 (service code) are
   * naturally bounded so we only cap the leaf stage.
   */
  private capSankeyFlights(raw: SankeyResponse, n: number): SankeyResponse {
    const sourceNames = new Set<string>(raw.links.map(l => l.source));
    const flightNodes = raw.nodes.filter(node => !sourceNames.has(node.name));
    if (flightNodes.length <= n) {
      return raw;
    }

    // Inbound weight per flight
    const inflow: { [name: string]: number } = {};
    for (const link of raw.links) {
      if (!sourceNames.has(link.target)) {
        inflow[link.target] = (inflow[link.target] || 0) + link.value;
      }
    }
    const sorted = Object.keys(inflow).sort((a, b) => inflow[b] - inflow[a]);
    const dropFlights = new Set(sorted.slice(n));
    if (dropFlights.size === 0) { return raw; }

    const otherTotal = Array.from(dropFlights).reduce((sum, f) => sum + (inflow[f] || 0), 0);
    const newNodes: SankeyNode[] = raw.nodes
      .filter(nd => !dropFlights.has(nd.name))
      .concat([{ name: 'Other flights', value: otherTotal }]);

    const collapsed: { [src: string]: number } = {};
    const newLinks: SankeyLink[] = [];
    for (const link of raw.links) {
      if (!dropFlights.has(link.target)) {
        newLinks.push(link);
      } else {
        collapsed[link.source] = (collapsed[link.source] || 0) + link.value;
      }
    }
    for (const src of Object.keys(collapsed)) {
      newLinks.push({ source: src, target: 'Other flights', value: collapsed[src] });
    }

    return { nodes: newNodes, links: newLinks };
  }

  /**
   * OQ-P3-3 drill-down dispatcher. Sankey nodes are passed by name; the
   * dispatcher infers which filter to mutate by inspecting the name.
   *
   * - 'Self' / 'Outsourced' → setHandledBy
   * - Service code (anything in monthlyMixKeys$) → toggleService
   * - 'Other flights' → no-op (pseudo-node, not a real flight)
   * - Otherwise → toggleFlight
   *
   * R-P3-1 risk acknowledged: a tenant whose service code matches 'Self' or
   * a flight number that matches an SSR code mis-routes. Pathological edge.
   */
  onSankeyNodeClick(name: string): void {
    if (!name) { return; }
    if (name === 'Self' || name === 'Outsourced') {
      this.filters.setHandledBy([name.toUpperCase()]);
      return;
    }
    if (this.monthlyMixKeys$.value.indexOf(name) >= 0) {
      this.filters.toggleService(name);
      return;
    }
    if (name === 'Other flights') { return; }
    this.filters.toggleFlight(name);
  }

  private colorMapForServices(types: string[]): { [code: string]: string } {
    const out: { [code: string]: string } = {};
    for (const t of types) {
      out[t] = SSR_COLORS[t] || '#94a3b8';
    }
    return out;
  }
}
