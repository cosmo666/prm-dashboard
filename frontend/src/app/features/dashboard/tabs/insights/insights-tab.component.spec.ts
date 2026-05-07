import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { InsightsTabComponent } from './insights-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('InsightsTabComponent', () => {
  let fixture: ComponentFixture<InsightsTabComponent>;
  let setAirlineSpy: jasmine.Spy;

  beforeEach(() => {
    setAirlineSpy = jasmine.createSpy('setAirline');
    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],     // empty triggers EMPTY guard, no forkJoin
      dateFromSnapshot: '',
      dateToSnapshot: '',
      setAirline: setAirlineSpy,
    };
    const dataStub = {
      pauseAnalysis:        () => of({ totalPaused: 0, pauseRate: 0, avgPauseDurationMinutes: 0, byServiceType: [] }),
      handlingDistribution: () => of({ labels: [], values: [] }),
      kpisSummary:          () => of({ totalAgents: 0, totalPrm: 0 }),
      noShows:              () => of({ items: [] }),
      topAgents:            () => of({ items: [] }),
      agentServiceMatrix:   () => of({ agents: [], agentNames: [], serviceTypes: [], values: [] }),
      trendsHourly:         () => of({ days: [], hours: [], values: [] }),
      durationByAgentType:  () => of({ serviceTypes: [], self: [], outsourced: [] }),
      trendsMonthly:        () => of({ months: [], values: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [InsightsTabComponent],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(InsightsTabComponent);
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('initial state: 4 KPIs at 0', () => {
    expect(fixture.componentInstance.pauseRate$.value).toBe(0);
    expect(fixture.componentInstance.outsourcedPct$.value).toBe(0);
    expect(fixture.componentInstance.avgPerAgent$.value).toBe(0);
    expect(fixture.componentInstance.noShowRate$.value).toBe(0);
  });

  it('initial state: every chart stream is empty', () => {
    expect(fixture.componentInstance.agentWorkload$.value).toEqual([]);
    expect(fixture.componentInstance.matrixCells$.value).toEqual([]);
    expect(fixture.componentInstance.hourlyHeatCells$.value).toEqual([]);
    expect(fixture.componentInstance.durationSelfBars$.value).toEqual([]);
    expect(fixture.componentInstance.durationOutBars$.value).toEqual([]);
    expect(fixture.componentInstance.monthlyTrendSeries$.value).toEqual([]);
    expect(fixture.componentInstance.noShowBars$.value).toEqual([]);
  });

  it('onAgentClick is a no-op (informational only on this branch)', () => {
    expect(() => fixture.componentInstance.onAgentClick('Bond')).not.toThrow();
  });

  it('onMonthClick is a no-op (informational only on this branch)', () => {
    expect(() => fixture.componentInstance.onMonthClick('2026-04')).not.toThrow();
  });

  it('onNoShowAirlineClick narrows airline filter to the clicked code', () => {
    fixture.componentInstance.onNoShowAirlineClick({ category: 'EK', value: 6.2 });
    expect(setAirlineSpy).toHaveBeenCalledWith(['EK']);
  });

  it('onNoShowAirlineClick ignores empty payload', () => {
    fixture.componentInstance.onNoShowAirlineClick({ category: '', value: 0 });
    fixture.componentInstance.onNoShowAirlineClick(null as any);
    expect(setAirlineSpy).not.toHaveBeenCalled();
  });
});
