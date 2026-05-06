import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { Top10TabComponent } from './top10-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('Top10TabComponent', () => {
  let fixture: ComponentFixture<Top10TabComponent>;
  let toggleAirlineSpy: jasmine.Spy;
  let toggleFlightSpy: jasmine.Spy;
  let toggleAgentNoSpy: jasmine.Spy;

  beforeEach(() => {
    toggleAirlineSpy = jasmine.createSpy('toggleAirline');
    toggleFlightSpy = jasmine.createSpy('toggleFlight');
    toggleAgentNoSpy = jasmine.createSpy('toggleAgentNo');

    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],
      dateFromSnapshot: '',
      flight$: of(''),
      agentNo$: of(''),
      toggleAirline: toggleAirlineSpy,
      toggleFlight: toggleFlightSpy,
      toggleAgentNo: toggleAgentNoSpy,
    };
    const dataStub = {
      topAirlines: () => of({ items: [] }),
      topFlights:  () => of({ items: [] }),
      topAgents:   () => of({ items: [] }),
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

  it('onAirlineBarClick calls FilterStore.toggleAirline with category (drill-down)', () => {
    fixture.componentInstance.onAirlineBarClick({ category: 'AI', value: 100 });
    expect(toggleAirlineSpy).toHaveBeenCalledWith('AI');
  });

  it('onFlightBarClick calls FilterStore.toggleFlight with category (OQ-P2-3)', () => {
    fixture.componentInstance.onFlightBarClick({ category: 'AI102', value: 80 });
    expect(toggleFlightSpy).toHaveBeenCalledWith('AI102');
  });

  it('onAgentRowClick calls FilterStore.toggleAgentNo with agentNo (OQ-P2-3)', () => {
    fixture.componentInstance.onAgentRowClick({
      rank: 1, agentNo: 'AGT-007', agentName: 'Bond', prmCount: 50,
      avgDurationMinutes: 30, topService: 'WCHR', topServiceCount: 20,
      topAirline: 'AI', daysActive: 30, avgPerDay: 1.7,
    });
    expect(toggleAgentNoSpy).toHaveBeenCalledWith('AGT-007');
  });

  it('drill-down handlers no-op on empty payload', () => {
    fixture.componentInstance.onAirlineBarClick({ category: '', value: 0 });
    fixture.componentInstance.onFlightBarClick({ category: '', value: 0 });
    fixture.componentInstance.onAgentRowClick({ agentNo: '' } as any);
    expect(toggleAirlineSpy).not.toHaveBeenCalled();
    expect(toggleFlightSpy).not.toHaveBeenCalled();
    expect(toggleAgentNoSpy).not.toHaveBeenCalled();
  });
});
