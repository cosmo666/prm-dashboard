import { Component, OnInit, OnDestroy, effect, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { TopBarComponent } from '../../shared/components/top-bar/top-bar.component';
import { FilterBarComponent } from './components/filter-bar/filter-bar.component';
import { OverviewComponent } from './tabs/overview/overview.component';
import { Top10Component } from './tabs/top10/top10.component';
import { ServiceBreakupComponent } from './tabs/service-breakup/service-breakup.component';
import { FulfillmentComponent } from './tabs/fulfillment/fulfillment.component';
import { InsightsComponent } from './tabs/insights/insights.component';
import { FilterStore } from '../../core/store/filter.store';
import { NavigationStore } from '../../core/store/navigation.store';
import { resolvePreset } from './utils/date-presets';

const TAB_NAMES = ['Overview', 'Top 10', 'Service Breakup', 'Fulfillment', 'Insights'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatTabsModule, TopBarComponent, FilterBarComponent,
            OverviewComponent, Top10Component, ServiceBreakupComponent, FulfillmentComponent,
            InsightsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  filters = inject(FilterStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private nav = inject(NavigationStore);

  activeTab = signal(0);
  private initialized = false;

  // Human-readable summary of active secondary filters, e.g.
  // "Filtered by airline · IX" or "3 filters applied · IX / WCHR / SELF"
  filterSummary = computed(() => {
    const active: string[] = [
      ...this.filters.airline(),
      ...this.filters.service(),
      ...this.filters.handledBy(),
    ];
    if (active.length === 0) return '';
    if (active.length === 1) return `Filtered by ${active[0]}`;
    return `${active.length} filters applied · ${active.join(' / ')}`;
  });

  constructor() {
    // URL <-> FilterStore sync (after initial load)
    effect(() => {
      const params = this.filters.queryParams();
      if (!this.initialized) return;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: params,
        replaceUrl: true,
      });
    }, { allowSignalWrites: true });

    // Publish the active tab name to the navigation store
    effect(() => {
      const idx = this.activeTab();
      this.nav.setActiveTab(TAB_NAMES[idx] ?? null);
    }, { allowSignalWrites: true });

    // Listen for tab-switch requests from outside (e.g. the command palette).
    // The tick signal changes on every request so this effect fires even when
    // the requested index matches the current one.
    effect(() => {
      const tick = this.nav.requestedTabTick();
      if (tick === 0) return;
      const idx = this.nav.requestedTabIndex();
      if (idx != null && idx >= 0 && idx < TAB_NAMES.length) {
        this.activeTab.set(idx);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    // Hydrate FilterStore from URL query params on mount
    const map = this.route.snapshot.queryParamMap;
    const fromUrl: Record<string, string> = {};
    for (const key of map.keys) {
      const val = map.get(key);
      if (val != null) fromUrl[key] = val;
    }
    if (Object.keys(fromUrl).length > 0) {
      this.filters.loadFromQueryParams(fromUrl);
    }

    // Default date range to Month-to-Date if not set by URL
    if (!this.filters.dateFrom()) {
      const r = resolvePreset('mtd');
      this.filters.setDateRange('mtd', r.from, r.to);
    }

    this.initialized = true;
  }

  ngOnDestroy(): void {
    this.nav.clear();
  }

  onTabChange(index: number): void {
    this.activeTab.set(index);
  }
}
