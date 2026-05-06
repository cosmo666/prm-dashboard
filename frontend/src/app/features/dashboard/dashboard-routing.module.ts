import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DashboardComponent } from './dashboard.component';
import { OverviewTabComponent } from './tabs/overview/overview-tab.component';
import { Top10TabComponent } from './tabs/top10/top10-tab.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '',         pathMatch: 'full', redirectTo: 'overview' },
      { path: 'overview', component: OverviewTabComponent, data: { title: 'Overview' } },
      { path: 'top10',    component: Top10TabComponent,    data: { title: 'Top 10' } },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DashboardRoutingModule {}
