import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { MultiSelectModule } from 'primeng/multiselect';

import { FilterBarComponent } from './filter-bar.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('FilterBarComponent', () => {
  let fixture: ComponentFixture<FilterBarComponent>;

  beforeEach(() => {
    const filterStub = {
      airport$:   of([]),
      airline$:   of([]),
      service$:   of([]),
      handledBy$: of([]),
      airportSnapshot:   [],
      airlineSnapshot:   [],
      serviceSnapshot:   [],
      handledBySnapshot: [],
      setAirline:    () => { /* noop */ },
      setService:    () => { /* noop */ },
      setHandledBy:  () => { /* noop */ },
      removeAirline:    () => { /* noop */ },
      removeService:    () => { /* noop */ },
      removeHandledBy:  () => { /* noop */ },
      clearSecondary:   () => { /* noop */ },
    };
    const dataStub = {
      filterOptions: () => of({
        airlines: [], services: [], handledBy: [], flights: [],
        minDate: null, maxDate: null,
      }),
    };
    TestBed.configureTestingModule({
      declarations: [FilterBarComponent],
      // MultiSelectModule provides the real ControlValueAccessor for p-multiSelect;
      // NO_ERRORS_SCHEMA only suppresses element resolution, not [(ngModel)] binding.
      imports: [FormsModule, MultiSelectModule, NoopAnimationsModule],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      // Skip resolution of <app-form-field>, <app-airport-selector>, <app-date-range-picker>.
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(FilterBarComponent);
  });

  it('creates without throwing', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
