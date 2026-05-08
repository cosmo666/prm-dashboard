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
import { CompactNumberPipe } from './pipes/compact-number.pipe';
import { TooltipDirective } from './directives/tooltip.directive';

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
    CompactNumberPipe,
    TooltipDirective,
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
    CompactNumberPipe,
    TooltipDirective,
  ],
})
export class SharedModule {}
