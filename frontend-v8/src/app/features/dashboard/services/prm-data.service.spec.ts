import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PrmDataService } from './prm-data.service';
import { ApiClient } from 'src/app/core/api/api.client';
import { FilterStore } from 'src/app/core/store/filter.store';

describe('PrmDataService', () => {
  let service: PrmDataService;
  let apiSpy: jasmine.SpyObj<ApiClient>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj<ApiClient>('ApiClient', ['get', 'post', 'delete']);
    apiSpy.get.and.returnValue(of({ totalPrm: 0 } as any));

    const filterStub: Partial<FilterStore> = {
      airportSnapshot: ['DEL', 'BOM'],
      dateFromSnapshot: '2026-04-01',
      dateToSnapshot: '2026-04-30',
      airlineSnapshot: [],
      serviceSnapshot: [],
      handledBySnapshot: [],
    };

    TestBed.configureTestingModule({
      providers: [
        PrmDataService,
        { provide: ApiClient, useValue: apiSpy },
        { provide: FilterStore, useValue: filterStub },
      ],
    });
    service = TestBed.get(PrmDataService);
  });

  it('kpisSummary calls /prm/kpis/summary with airport+date params', () => {
    service.kpisSummary().subscribe();
    expect(apiSpy.get).toHaveBeenCalledWith('/prm/kpis/summary', {
      airport: 'DEL,BOM',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
  });

  it('trendsHourly calls /prm/trends/hourly', () => {
    service.trendsHourly().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/trends/hourly');
  });

  it('topAirlines passes limit', () => {
    service.topAirlines(7).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/rankings/airlines');
    const params = args[1] as { [key: string]: string };
    expect(params.limit).toBe('7');
  });

  it('filterOptions passes only airport', () => {
    service.filterOptions().subscribe();
    expect(apiSpy.get).toHaveBeenCalledWith('/prm/filters/options', { airport: 'DEL,BOM' });
  });

  it('topFlights passes limit to /prm/rankings/flights', () => {
    service.topFlights(5).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/rankings/flights');
    const params = args[1] as { [key: string]: string };
    expect(params.limit).toBe('5');
  });

  it('topAgents passes limit to /prm/rankings/agents', () => {
    service.topAgents(10).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/rankings/agents');
    const params = args[1] as { [key: string]: string };
    expect(params.limit).toBe('10');
  });

  it('serviceBreakupSankey calls /prm/breakdowns/by-agent-type', () => {
    service.serviceBreakupSankey().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/breakdowns/by-agent-type');
  });

  it('serviceTypeMatrix calls /prm/breakdowns/by-service-type', () => {
    service.serviceTypeMatrix().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/breakdowns/by-service-type');
  });

  it('topRoutes passes limit to /prm/breakdowns/by-route', () => {
    service.topRoutes(5).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/breakdowns/by-route');
    const params = args[1] as { [key: string]: string };
    expect(params.limit).toBe('5');
  });

  it('requestedVsProvided calls /prm/kpis/requested-vs-provided', () => {
    service.requestedVsProvided().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/kpis/requested-vs-provided');
  });

  it('trendsRequestedProvided calls /prm/trends/requested-vs-provided', () => {
    service.trendsRequestedProvided().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/trends/requested-vs-provided');
  });

  it('trendsMonthly calls /prm/trends/monthly', () => {
    service.trendsMonthly().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/trends/monthly');
  });

  it('pauseAnalysis calls /prm/performance/pause-analysis', () => {
    service.pauseAnalysis().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/performance/pause-analysis');
  });

  it('durationByAgentType calls /prm/performance/duration-by-agent-type', () => {
    service.durationByAgentType().subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/performance/duration-by-agent-type');
  });

  it('agentServiceMatrix passes limit to /prm/breakdowns/agent-service-matrix', () => {
    service.agentServiceMatrix(8).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/breakdowns/agent-service-matrix');
    const params = args[1] as { [key: string]: string };
    expect(params.limit).toBe('8');
  });

  it('filterOptions short-circuits when airportSnapshot is empty (no HTTP)', () => {
    const emptyStub: Partial<FilterStore> = {
      airportSnapshot: [],
      dateFromSnapshot: '', dateToSnapshot: '',
      airlineSnapshot: [], serviceSnapshot: [], handledBySnapshot: [],
    };
    TestBed.resetTestingModule();
    apiSpy = jasmine.createSpyObj<ApiClient>('ApiClient', ['get', 'post', 'delete']);
    TestBed.configureTestingModule({
      providers: [
        PrmDataService,
        { provide: ApiClient, useValue: apiSpy },
        { provide: FilterStore, useValue: emptyStub },
      ],
    });
    const svc = TestBed.get(PrmDataService);
    let captured: any = null;
    svc.filterOptions().subscribe((r: any) => { captured = r; });
    expect(apiSpy.get).not.toHaveBeenCalled();
    expect(captured).toEqual({
      airlines: [], services: [], handledBy: [], flights: [],
      minDate: null, maxDate: null,
    });
  });
});
