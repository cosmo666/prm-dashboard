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
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TabViewModule } from 'primeng/tabview';

import { FormFieldComponent } from './components/form-field/form-field.component';

@NgModule({
  declarations: [FormFieldComponent],
  exports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule,
    ButtonModule, InputTextModule, DropdownModule, MultiSelectModule,
    CardModule, MenuModule, TooltipModule, CheckboxModule, ProgressBarModule,
    ToastModule, DialogModule, CalendarModule, InputSwitchModule, TabViewModule,
    FormFieldComponent,
  ],
})
export class SharedModule {}
