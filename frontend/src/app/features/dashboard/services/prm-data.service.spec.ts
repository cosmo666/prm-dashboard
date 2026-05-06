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

  it('topAirlines passes limit', () => {
    service.topAirlines(7).subscribe();
    const args = apiSpy.get.calls.mostRecent().args;
    expect(args[0]).toBe('/prm/rankings/airlines');
    const params = args[1] as { [key: string]: string };
    expect(params['limit']).toBe('7');
  });

  it('filterOptions passes only airport', () => {
    service.filterOptions().subscribe();
    expect(apiSpy.get).toHaveBeenCalledWith('/prm/filters/options', { airport: 'DEL,BOM' });
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
