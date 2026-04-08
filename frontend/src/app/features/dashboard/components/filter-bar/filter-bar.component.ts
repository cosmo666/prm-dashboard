import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DateRangePickerComponent } from '../date-range-picker/date-range-picker.component';
import { FilterStore } from '../../../../core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule, MatChipsModule, MatButtonModule, MatIconModule, DateRangePickerComponent],
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
      next: (res: any) => {
        this.airlines.set(res.airlines ?? []);
        this.services.set(res.services ?? []);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  setAirline(v: string | null)  { this.filters.setFilter({ airline: v ?? '' }); }
  setService(v: string | null)  { this.filters.setFilter({ service: v ?? '' }); }
  setHandledBy(v: string | null) { this.filters.setFilter({ handledBy: v ?? '' }); }
  clearAll() { this.filters.clearSecondary(); }
}
