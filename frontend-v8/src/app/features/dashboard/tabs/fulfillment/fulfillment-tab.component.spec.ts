import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { FulfillmentTabComponent, timeBin } from './fulfillment-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { CompactNumberPipe } from 'src/app/shared/pipes/compact-number.pipe';

describe('FulfillmentTabComponent', () => {
  let fixture: ComponentFixture<FulfillmentTabComponent>;

  beforeEach(() => {
    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],     // empty triggers EMPTY guard, no forkJoin
      dateFromSnapshot: '',
      dateToSnapshot: '',
    };
    const dataStub = {
      requestedVsProvided: () => of({
        totalRequested: 0, totalProvided: 0,
        providedAgainstRequested: 0, fulfillmentRate: 0, walkUpRate: 0,
      }),
      trendsRequestedProvided: () => of({ dates: [], provided: [], requested: [] }),
      trendsHourly: () => of({ days: [], hours: [], values: [] }),
      trendsDaily:  () => of({ dates: [], values: [], average: 0 }),
    };
    TestBed.configureTestingModule({
      declarations: [FulfillmentTabComponent, CompactNumberPipe],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(FulfillmentTabComponent);
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('initial state: KPIs at 0 and chart series empty', () => {
    expect(fixture.componentInstance.totalRequested$.value).toBe(0);
    expect(fixture.componentInstance.totalProvided$.value).toBe(0);
    expect(fixture.componentInstance.providedPct$.value).toBe(0);
    expect(fixture.componentInstance.walkupRate$.value).toBe(0);
    expect(fixture.componentInstance.dualAxisSeries$.value).toEqual([]);
    expect(fixture.componentInstance.timeOfDay$.value).toEqual([]);
    expect(fixture.componentInstance.cumulativeSeries$.value).toEqual([]);
  });
});

describe('timeBin', () => {
  it('buckets each hour into the right 4-hour window', () => {
    expect(timeBin(0)).toBe('00-04');
    expect(timeBin(3)).toBe('00-04');
    expect(timeBin(4)).toBe('04-08');
    expect(timeBin(7)).toBe('04-08');
    expect(timeBin(8)).toBe('08-12');
    expect(timeBin(11)).toBe('08-12');
    expect(timeBin(12)).toBe('12-16');
    expect(timeBin(15)).toBe('12-16');
    expect(timeBin(16)).toBe('16-20');
    expect(timeBin(19)).toBe('16-20');
    expect(timeBin(20)).toBe('20-24');
    expect(timeBin(23)).toBe('20-24');
  });

  it('zero-pads single-digit boundaries', () => {
    // Sanity: '00-04' uses two-digit padding, not '0-4'. Catches a regression
    // where someone replaces the ('00' + n).slice(-2) idiom with String(n).
    expect(timeBin(0)).toBe('00-04');
    expect(timeBin(4)).toBe('04-08');
  });
});
