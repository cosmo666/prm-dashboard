import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { TopBarComponent } from '../../shared/components/top-bar/top-bar.component';
import { FilterBarComponent } from './components/filter-bar/filter-bar.component';
import { OverviewComponent } from './tabs/overview/overview.component';
import { Top10Component } from './tabs/top10/top10.component';
import { ServiceBreakupComponent } from './tabs/service-breakup/service-breakup.component';
import { FulfillmentComponent } from './tabs/fulfillment/fulfillment.component';
import { FilterStore } from '../../core/store/filter.store';
import { resolvePreset } from './utils/date-presets';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatTabsModule, TopBarComponent, FilterBarComponent,
            OverviewComponent, Top10Component, ServiceBreakupComponent, FulfillmentComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  filters = inject(FilterStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  activeTab = signal(0);
  private initialized = false;

  constructor() {
    // Write filter changes back to the URL (after initial load has completed)
    effect(() => {
      const params = this.filters.queryParams();
      if (!this.initialized) return;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: params,
        replaceUrl: true,
      });
    });
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

  onTabChange(index: number) {
    this.activeTab.set(index);
  }
}
