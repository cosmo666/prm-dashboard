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

import { NgxEchartsModule } from 'ngx-echarts';

import { FormFieldComponent } from './components/form-field/form-field.component';
import { BaseChartComponent } from './charts/base-chart/base-chart.component';
import { BarChartComponent } from './charts/bar-chart/bar-chart.component';

// NgxEchartsModule.forRoot is called here so a single SharedModule import
// gives consumers the chart directive ready to render. Importing SharedModule
// in multiple lazy-loaded feature modules will re-run forRoot in each lazy
// injector — acceptable for the POC (echarts core is loaded once via the
// dynamic import factory).
@NgModule({
  imports: [
    NgxEchartsModule.forRoot({ echarts: () => import('echarts') }),
    ProgressSpinnerModule,
  ],
  declarations: [
    FormFieldComponent,
    BaseChartComponent,
    BarChartComponent,
  ],
  exports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    ButtonModule, InputTextModule, DropdownModule, MultiSelectModule,
    CardModule, MenuModule, TooltipModule, CheckboxModule, ProgressBarModule,
    ProgressSpinnerModule,
    ToastModule, DialogModule, CalendarModule, InputSwitchModule, TabViewModule,
    NgxEchartsModule,
    FormFieldComponent, BaseChartComponent, BarChartComponent,
  ],
})
export class SharedModule {}
