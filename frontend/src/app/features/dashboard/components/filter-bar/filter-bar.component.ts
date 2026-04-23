import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DateRangePickerComponent } from '../date-range-picker/date-range-picker.component';
import { SavedViewsMenuComponent } from '../../../../shared/components/saved-views-menu/saved-views-menu.component';
import { TooltipDirective } from '../../../../shared/directives/tooltip.directive';
import { FilterStore } from '../../../../core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule, MatChipsModule, MatButtonModule, MatIconModule, DateRangePickerComponent, SavedViewsMenuComponent, TooltipDirective],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent implements OnInit {
  filters = inject(FilterStore);
  private dataSvc = inject(PrmDataService);

  airlines = signal<string[]>([]);
  services = signal<string[]>([]);
  loaded = signal(false);

  ngOnInit() {
    this.dataSvc.filterOptions().subscribe({
      next: (res) => {
        this.airlines.set(res.airlines ?? []);
        this.services.set(res.services ?? []);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  setAirline(v: string[] | string | null)   { this.filters.setAirline(v); }
  setService(v: string[] | string | null)   { this.filters.setService(v); }
  setHandledBy(v: string[] | string | null) { this.filters.setHandledBy(v); }
  removeAirline(v: string)   { this.filters.removeAirline(v); }
  removeService(v: string)   { this.filters.removeService(v); }
  removeHandledBy(v: string) { this.filters.removeHandledBy(v); }
  clearAll() { this.filters.clearSecondary(); }

  // Display label for the "handled by" value in chips
  handledByLabel(v: string): string {
    if (v === 'SELF') return 'Self';
    if (v === 'OUTSOURCED') return 'Outsourced';
    return v;
  }
}
