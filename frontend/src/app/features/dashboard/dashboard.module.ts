import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';

import { DashboardComponent } from './dashboard.component';
import { OverviewTabComponent } from './tabs/overview/overview-tab.component';
import { Top10TabComponent } from './tabs/top10/top10-tab.component';
import { FilterBarComponent } from './components/filter-bar/filter-bar.component';
import { AirportSelectorComponent } from './components/airport-selector/airport-selector.component';
import { DateRangePickerComponent } from './components/date-range-picker/date-range-picker.component';
import { PrmDataService } from './services/prm-data.service';

import { DashboardRoutingModule } from './dashboard-routing.module';

/**
 * Lazy-loaded dashboard module. Imports SharedModule (which already declares
 * KpiCardComponent + chart wrappers). Provides PrmDataService at module scope
 * so it lives in the lazy injector — see spec §4 P1-Q8.
 */
@NgModule({
  imports: [
    SharedModule,
    DashboardRoutingModule,
  ],
  declarations: [
    DashboardComponent,
    OverviewTabComponent,
    Top10TabComponent,
    FilterBarComponent,
    AirportSelectorComponent,
    DateRangePickerComponent,
  ],
  providers: [
    PrmDataService,
  ],
})
export class DashboardModule {}
