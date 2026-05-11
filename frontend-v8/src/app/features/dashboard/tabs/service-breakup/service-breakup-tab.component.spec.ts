import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, BehaviorSubject } from 'rxjs';
import { ServiceBreakupTabComponent } from './service-breakup-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('ServiceBreakupTabComponent', () => {
  let fixture: ComponentFixture<ServiceBreakupTabComponent>;
  let setServiceSpy: jasmine.Spy;
  let serviceSubject: BehaviorSubject<string[]>;
  // tslint:disable-next-line: no-any
  let filterStub: any;

  beforeEach(() => {
    setServiceSpy = jasmine.createSpy('setService');
    serviceSubject = new BehaviorSubject<string[]>([]);

    filterStub = {
      queryParams$: of({}),
      service$: serviceSubject.asObservable(),
      airportSnapshot: [],
      dateFromSnapshot: '',
      serviceSnapshot: [] as string[],
      setService: (v: string[]) => {
        setServiceSpy(v);
        filterStub.serviceSnapshot = v;
        serviceSubject.next(v);
      },
    };
    const dataStub = {
      serviceTypeMatrix: () => of({ serviceTypes: [], rows: [] }),
      topServices: () => of({ items: [] }),
      trendsHourly: () => of({ days: [], hours: [], values: [] }),
    };
    TestBed.configureTestingModule({
      declarations: [ServiceBreakupTabComponent],
      providers: [
        { provide: FilterStore, useValue: filterStub },
        { provide: PrmDataService, useValue: dataStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(ServiceBreakupTabComponent);
  });

  it('renders without throwing on empty filters', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('exposes 9 IATA SSR codes in serviceTypes', () => {
    expect(fixture.componentInstance.serviceTypes.length).toBe(9);
    expect(fixture.componentInstance.serviceTypes).toContain('WCHR');
    expect(fixture.componentInstance.serviceTypes).toContain('WCMP');
  });

  it('onCardClick(WCHR) with no current focus → setService([WCHR])', () => {
    fixture.componentInstance.onCardClick('WCHR');
    expect(setServiceSpy).toHaveBeenCalledWith(['WCHR']);
  });

  it('onCardClick(WCHR) when WCHR is already the only focus → clears filter', () => {
    Object.defineProperty(fixture.componentInstance.filters, 'serviceSnapshot', {
      value: ['WCHR'], configurable: true, writable: true,
    });
    fixture.componentInstance.onCardClick('WCHR');
    expect(setServiceSpy).toHaveBeenCalledWith([]);
  });

  it('onCardClick(WCHC) when WCHR is the active single-focus → replaces with [WCHC]', () => {
    Object.defineProperty(fixture.componentInstance.filters, 'serviceSnapshot', {
      value: ['WCHR'], configurable: true, writable: true,
    });
    fixture.componentInstance.onCardClick('WCHC');
    expect(setServiceSpy).toHaveBeenCalledWith(['WCHC']);
  });

  it('onServiceBarClick routes the bar category to setService', () => {
    fixture.componentInstance.onServiceBarClick({ category: 'MAAS', value: 42 });
    expect(setServiceSpy).toHaveBeenCalledWith(['MAAS']);
  });

  it('onServiceBarClick ignores empty category', () => {
    fixture.componentInstance.onServiceBarClick({ category: '', value: 0 });
    expect(setServiceSpy).not.toHaveBeenCalled();
  });

  it('isMaxInColumn returns true only for the column max', () => {
    fixture.componentInstance.maxPerColumn$.next({ WCHR: 100, WCHC: 50 });
    expect(fixture.componentInstance.isMaxInColumn('WCHR', 100)).toBe(true);
    expect(fixture.componentInstance.isMaxInColumn('WCHR', 99)).toBe(false);
    expect(fixture.componentInstance.isMaxInColumn('WCHR', 0)).toBe(false);
    expect(fixture.componentInstance.isMaxInColumn('WCHC', 50)).toBe(true);
  });

  it('isCardActive returns true when code is in active list', () => {
    expect(fixture.componentInstance.isCardActive('WCHR', ['WCHR', 'WCHC'])).toBe(true);
    expect(fixture.componentInstance.isCardActive('MAAS', ['WCHR', 'WCHC'])).toBe(false);
    expect(fixture.componentInstance.isCardActive('WCHR', null)).toBe(false);
    expect(fixture.componentInstance.isCardActive('WCHR', [])).toBe(false);
  });
});
