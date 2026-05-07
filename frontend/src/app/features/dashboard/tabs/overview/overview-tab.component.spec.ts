import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { OverviewTabComponent } from './overview-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { CompactNumberPipe } from 'src/app/shared/pipes/compact-number.pipe';

describe('OverviewTabComponent', () => {
  let component: OverviewTabComponent;
  let fixture: ComponentFixture<OverviewTabComponent>;
  let setHandledBySpy: jasmine.Spy;
  let setServiceSpy: jasmine.Spy;
  let setDateRangeSpy: jasmine.Spy;

  beforeEach(() => {
    setHandledBySpy = jasmine.createSpy('setHandledBy');
    setServiceSpy = jasmine.createSpy('setService');
    setDateRangeSpy = jasmine.createSpy('setDateRange');
    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],     // empty triggers EMPTY guard, no forkJoin
      dateFromSnapshot: '',
      dateToSnapshot: '',
      setHandledBy: setHandledBySpy,
      setService: setServiceSpy,
      setDateRange: setDateRangeSpy,
    };
    const dataStub = {
      kpisSummary: () => of({}),
      handlingDistribution: () => of({ labels: [], values: [] }),
      trendsDaily: () => of({ dates: [], values: [], average: 0 }),
      topServices: () => of({ items: [] }),
      durationDistribution: () => of({ buckets: [], p50: 0, p90: 0, avg: 0 }),
      byLocation: () => of({ items: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [OverviewTabComponent, CompactNumberPipe],
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

  it('exposes DEMO_ANNOTATIONS for the line chart', () => {
    expect(component.annotations).toBeDefined();
    expect(Array.isArray(component.annotations)).toBe(true);
  });

  it('onHandlingClick("Self") sets handled_by to SELF', () => {
    component.onHandlingClick({ name: 'Self', value: 100 });
    expect(setHandledBySpy).toHaveBeenCalledWith(['SELF']);
  });

  it('onHandlingClick("Outsourced") sets handled_by to OUTSOURCED', () => {
    component.onHandlingClick({ name: 'Outsourced', value: 50 });
    expect(setHandledBySpy).toHaveBeenCalledWith(['OUTSOURCED']);
  });

  it('onHandlingClick is case-insensitive on the prefix', () => {
    component.onHandlingClick({ name: 'self-handled', value: 1 });
    expect(setHandledBySpy).toHaveBeenCalledWith(['SELF']);
  });

  it('onHandlingClick ignores empty payload', () => {
    component.onHandlingClick(null as any);
    expect(setHandledBySpy).not.toHaveBeenCalled();
  });

  it('onServiceTypeClick(WCHR) sets service to [WCHR]', () => {
    component.onServiceTypeClick({ name: 'WCHR', value: 100 });
    expect(setServiceSpy).toHaveBeenCalledWith(['WCHR']);
  });

  it('onDailyPointClick narrows to a single ISO date', () => {
    component.onDailyPointClick('2026-03-15');
    expect(setDateRangeSpy).toHaveBeenCalledWith('custom', '2026-03-15', '2026-03-15');
  });

  it('onDailyPointClick rejects non-ISO labels', () => {
    component.onDailyPointClick('Mar 15');
    expect(setDateRangeSpy).not.toHaveBeenCalled();
  });

  it('onDailyPointClick ignores empty', () => {
    component.onDailyPointClick('');
    expect(setDateRangeSpy).not.toHaveBeenCalled();
  });
});
