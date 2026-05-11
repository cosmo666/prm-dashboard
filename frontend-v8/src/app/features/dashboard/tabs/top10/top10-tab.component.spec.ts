import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { Top10TabComponent, AgentRow } from './top10-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('Top10TabComponent', () => {
  let fixture: ComponentFixture<Top10TabComponent>;
  let setAirlineSpy: jasmine.Spy;
  let setFlightSpy: jasmine.Spy;
  let toggleAgentNoSpy: jasmine.Spy;

  beforeEach(() => {
    setAirlineSpy = jasmine.createSpy('setAirline');
    setFlightSpy = jasmine.createSpy('setFlight');
    toggleAgentNoSpy = jasmine.createSpy('toggleAgentNo');

    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],
      dateFromSnapshot: '',
      flight$: of(''),
      agentNo$: of(''),
      setAirline: setAirlineSpy,
      setFlight: setFlightSpy,
      toggleAgentNo: toggleAgentNoSpy,
    };
    const dataStub = {
      topAirlines: () => of({ items: [] }),
      topFlights:  () => of({ items: [] }),
      topAgents:   () => of({ items: [] }),
      byRoute:     () => of({ items: [] }),
      noShows:     () => of({ items: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [Top10TabComponent],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(Top10TabComponent);
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('exposes 4 topX options [5, 10, 15, 20]', () => {
    expect(fixture.componentInstance.topXOptions).toEqual([5, 10, 15, 20]);
  });

  it('setTopX(20) updates topX$', () => {
    fixture.componentInstance.setTopX(20);
    expect(fixture.componentInstance.topX$.value).toBe(20);
  });

  it('setTopX is idempotent for the same value', () => {
    let pushed = 0;
    fixture.componentInstance.topX$.subscribe(() => { pushed++; });
    fixture.componentInstance.setTopX(10); // already 10 from initial
    expect(pushed).toBe(1); // initial only
  });

  it('formatRank pads single digits to 2 chars', () => {
    expect(fixture.componentInstance.formatRank(1)).toBe('01');
    expect(fixture.componentInstance.formatRank(9)).toBe('09');
    expect(fixture.componentInstance.formatRank(10)).toBe('10');
    expect(fixture.componentInstance.formatRank(20)).toBe('20');
  });

  it('rankClass returns gold/silver/bronze for top 3 only', () => {
    expect(fixture.componentInstance.rankClass(1)).toBe('rank--gold');
    expect(fixture.componentInstance.rankClass(2)).toBe('rank--silver');
    expect(fixture.componentInstance.rankClass(3)).toBe('rank--bronze');
    expect(fixture.componentInstance.rankClass(4)).toBe('');
    expect(fixture.componentInstance.rankClass(10)).toBe('');
  });

  it('durationClass uses fast/mid/slow thresholds', () => {
    expect(fixture.componentInstance.durationClass(15)).toBe('duration--fast');
    expect(fixture.componentInstance.durationClass(30)).toBe('duration--mid');
    expect(fixture.componentInstance.durationClass(60)).toBe('duration--slow');
  });

  it('daysLabel returns the editorial cadence label', () => {
    expect(fixture.componentInstance.daysLabel(25)).toBe('daily');
    expect(fixture.componentInstance.daysLabel(15)).toBe('frequent');
    expect(fixture.componentInstance.daysLabel(7)).toBe('regular');
    expect(fixture.componentInstance.daysLabel(2)).toBe('occasional');
    expect(fixture.componentInstance.daysLabel(0)).toBe('inactive');
  });

  it('onAirlineClick sets airline single-focus', () => {
    fixture.componentInstance.onAirlineClick({ category: 'AI', value: 100 });
    expect(setAirlineSpy).toHaveBeenCalledWith(['AI']);
  });

  it('onFlightClick sets flight filter to category', () => {
    fixture.componentInstance.onFlightClick({ category: 'AI102', value: 80 });
    expect(setFlightSpy).toHaveBeenCalledWith('AI102');
  });

  it('onNoShowAirlineClick sets airline single-focus', () => {
    fixture.componentInstance.onNoShowAirlineClick({ category: 'EK', value: 6.2 });
    expect(setAirlineSpy).toHaveBeenCalledWith(['EK']);
  });

  it('onAgentRowClick toggles agentNo filter', () => {
    const row: AgentRow = {
      rank: 1, agentNo: 'AGT-007', name: 'Bond', count: 50,
      avgDuration: 30, avgPerDay: 1.7, topService: 'WCHR', topServiceCount: 20,
      topAirline: 'AI', daysActive: 30,
    };
    fixture.componentInstance.onAgentRowClick(row);
    expect(toggleAgentNoSpy).toHaveBeenCalledWith('AGT-007');
  });

  it('handlers no-op on empty payload', () => {
    fixture.componentInstance.onAirlineClick({ category: '', value: 0 });
    fixture.componentInstance.onFlightClick({ category: '', value: 0 });
    fixture.componentInstance.onNoShowAirlineClick({ category: '', value: 0 });
    fixture.componentInstance.onAgentRowClick({ agentNo: '' } as AgentRow);
    expect(setAirlineSpy).not.toHaveBeenCalled();
    expect(setFlightSpy).not.toHaveBeenCalled();
    expect(toggleAgentNoSpy).not.toHaveBeenCalled();
  });
});
