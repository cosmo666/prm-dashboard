import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { OverviewTabComponent } from './overview-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('OverviewTabComponent', () => {
  let component: OverviewTabComponent;
  let fixture: ComponentFixture<OverviewTabComponent>;

  beforeEach(() => {
    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],     // empty triggers EMPTY guard, no forkJoin
      dateFromSnapshot: '',
      toggleAirline: () => {},
      toggleService: () => {},
    };
    const dataStub = {
      kpisSummary: () => of({}),
      trendsDaily: () => of({ dates: [], values: [], average: 0 }),
      trendsDailyPrev: () => of({ dates: [], values: [], average: 0 }),
      topAirlines: () => of({ items: [] }),
      topServices: () => of({ items: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [OverviewTabComponent],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(OverviewTabComponent);
    component = fixture.componentInstance;
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('formatCount handles null', () => {
    expect(component.formatCount(null)).toBe('—');
  });

  it('formatCount handles >= 1M (with one decimal)', () => {
    expect(component.formatCount(1_500_000)).toBe('1.5M');
  });

  it('formatCount handles >= 1k (with one decimal)', () => {
    expect(component.formatCount(15234)).toBe('15.2k');
  });

  it('formatCount handles < 1k (toLocaleString)', () => {
    expect(component.formatCount(500)).toBe('500');
  });
});
