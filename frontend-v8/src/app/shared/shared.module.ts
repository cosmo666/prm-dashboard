import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { CardModule } from 'primeng/card';
import { MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TabViewModule } from 'primeng/tabview';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { TableModule } from 'primeng/table';

import { NgxEchartsModule } from 'ngx-echarts';

import { FormFieldComponent } from './components/form-field/form-field.component';
import { BaseChartComponent } from './charts/base-chart/base-chart.component';
import { BarChartComponent } from './charts/bar-chart/bar-chart.component';
import { LineChartComponent } from './charts/line-chart/line-chart.component';
import { DonutChartComponent } from './charts/donut-chart/donut-chart.component';
import { ShareBarsComponent } from './charts/share-bars/share-bars.component';
import { HorizontalBarChartComponent } from './charts/horizontal-bar-chart/horizontal-bar-chart.component';
import { SankeyChartComponent } from './charts/sankey-chart/sankey-chart.component';
import { HeatmapChartComponent } from './charts/heatmap-chart/heatmap-chart.component';
import { KpiCardComponent } from '../features/dashboard/components/kpi-card/kpi-card.component';
import { DevTenantPickerComponent } from './components/dev-tenant-picker/dev-tenant-picker.component';
import { CompactNumberPipe } from './pipes/compact-number.pipe';

// NgxEchartsModule.forRoot is called once at AppModule level so the echarts
// factory provider lives in the root injector. SharedModule only re-exports
// the bare NgxEchartsModule (its directive) so lazy feature modules that
// import SharedModule resolve the existing root-injector provider rather
// than instantiating their own chart factory per lazy injector.
@NgModule({
  imports: [
    CommonModule,
    NgxEchartsModule,
    ProgressSpinnerModule,
    // TooltipModule is needed at IMPORT level (not just exports) so
    // components declared INSIDE SharedModule (KpiCardComponent and
    // DevTenantPickerComponent both use pTooltip) can reach it during
    // AOT template compilation. ng build --configuration production
    // is the gate that catches the omission; karma + JIT compile
    // happen to be more permissive. OverlayPanelModule + FormsModule
    // are still re-exported below (DashboardModule's date-range-picker
    // uses OverlayPanel, every reactive form uses FormsModule), so we
    // keep them imported here for symmetry even though no in-SharedModule
    // component currently consumes them.
    TooltipModule,
    OverlayPanelModule,
    FormsModule,
  ],
  declarations: [
    FormFieldComponent,
    BaseChartComponent,
    BarChartComponent,
    LineChartComponent,
    DonutChartComponent,
    ShareBarsComponent,
    HorizontalBarChartComponent,
    SankeyChartComponent,
    HeatmapChartComponent,
    KpiCardComponent,
    DevTenantPickerComponent,
    CompactNumberPipe,
  ],
  exports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    ButtonModule, InputTextModule, DropdownModule, MultiSelectModule,
    CardModule, MenuModule, TooltipModule, CheckboxModule, ProgressBarModule,
    ProgressSpinnerModule,
    ToastModule, DialogModule, CalendarModule, InputSwitchModule, TabViewModule,
    OverlayPanelModule, TableModule,
    NgxEchartsModule,
    FormFieldComponent, BaseChartComponent, BarChartComponent,
    LineChartComponent, DonutChartComponent, ShareBarsComponent,
    HorizontalBarChartComponent,
    SankeyChartComponent, HeatmapChartComponent,
    KpiCardComponent,
    DevTenantPickerComponent,
    CompactNumberPipe,
  ],
})
export class SharedModule {}
