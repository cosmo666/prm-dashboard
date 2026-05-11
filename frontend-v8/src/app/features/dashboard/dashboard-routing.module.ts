import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DashboardComponent } from './dashboard.component';
import { OverviewTabComponent } from './tabs/overview/overview-tab.component';
import { Top10TabComponent } from './tabs/top10/top10-tab.component';
import { ServiceBreakupTabComponent } from './tabs/service-breakup/service-breakup-tab.component';
import { FulfillmentTabComponent } from './tabs/fulfillment/fulfillment-tab.component';
import { InsightsTabComponent } from './tabs/insights/insights-tab.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '',                pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview',        component: OverviewTabComponent,       data: { title: 'Overview' } },
      { path: 'top10',           component: Top10TabComponent,          data: { title: 'Top 10' } },
      { path: 'service-breakup', component: ServiceBreakupTabComponent, data: { title: 'Service Breakup' } },
      { path: 'fulfillment',     component: FulfillmentTabComponent,    data: { title: 'Fulfillment' } },
      { path: 'insights',        component: InsightsTabComponent,       data: { title: 'Insights' } },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
