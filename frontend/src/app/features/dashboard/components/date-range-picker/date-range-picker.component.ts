import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { FilterStore, DatePreset } from '../../../../core/store/filter.store';
import { PRESET_DEFS, resolvePreset } from '../../utils/date-presets';

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <button mat-stroked-button [matMenuTriggerFor]="menu" class="range-btn">
      <mat-icon>date_range</mat-icon>
      {{ currentLabel() }}
      <mat-icon>arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu" class="date-preset-menu">
      <button mat-menu-item *ngFor="let p of presets"
              [class.active]="filters.datePreset() === p.key"
              (click)="select(p.key)">
        {{ p.label }}
      </button>
    </mat-menu>
  `,
  styles: [`
    .range-btn { min-width: 200px; justify-content: space-between; }
    .active { background: rgba(25, 118, 210, 0.1); font-weight: 600; }
  `],
})
export class DateRangePickerComponent {
  filters = inject(FilterStore);
  presets = PRESET_DEFS.filter(p => p.key !== 'custom');

  currentLabel(): string {
    const p = PRESET_DEFS.find(x => x.key === this.filters.datePreset());
    return p?.label ?? 'Select range';
  }

  select(preset: DatePreset) {
    const r = resolvePreset(preset);
    this.filters.setDateRange(preset, r.from, r.to);
  }
}
