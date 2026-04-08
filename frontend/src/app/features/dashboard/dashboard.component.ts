import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class DashboardComponent {
  filters = inject(FilterStore);
  activeTab = signal(0);

  constructor() {
    // Default date range to Month-to-Date if not set
    if (!this.filters.dateFrom()) {
      const r = resolvePreset('mtd');
      this.filters.setDateRange('mtd', r.from, r.to);
    }
  }

  onTabChange(index: number) {
    this.activeTab.set(index);
  }
}
