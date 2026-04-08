import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../core/store/auth.store';
import { FilterStore } from '../../../core/store/filter.store';

@Component({
  selector: 'app-airport-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule, MatFormFieldModule],
  template: `
    <mat-form-field appearance="outline" class="airport-field" subscriptSizing="dynamic">
      <mat-label>Airport</mat-label>
      <mat-select
        [ngModel]="filters.airport()"
        (ngModelChange)="onChange($event)"
        [disabled]="airports().length <= 1">
        <mat-option *ngFor="let a of airports()" [value]="a.code">
          {{ a.code }} — {{ a.name }}
        </mat-option>
      </mat-select>
    </mat-form-field>
  `,
  styles: [`.airport-field { width: 260px; }`],
})
export class AirportSelectorComponent {
  private auth = inject(AuthStore);
  filters = inject(FilterStore);
  airports = computed(() => this.auth.employee()?.airports ?? []);

  constructor() {
    effect(() => {
      // Default to first airport if none selected and airports are loaded
      const list = this.airports();
      if (list.length > 0 && !this.filters.airport()) {
        this.filters.setAirport(list[0].code);
      }
    }, { allowSignalWrites: true });
  }

  onChange(code: string) { this.filters.setAirport(code); this.filters.clearSecondary(); }
}
