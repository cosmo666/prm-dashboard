import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { ServiceBreakupTabComponent } from './service-breakup-tab.component';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';

describe('ServiceBreakupTabComponent', () => {
  let fixture: ComponentFixture<ServiceBreakupTabComponent>;
  let toggleServiceSpy: jasmine.Spy;
  let toggleFlightSpy: jasmine.Spy;
  let setHandledBySpy: jasmine.Spy;

  beforeEach(() => {
    toggleServiceSpy = jasmine.createSpy('toggleService');
    toggleFlightSpy = jasmine.createSpy('toggleFlight');
    setHandledBySpy = jasmine.createSpy('setHandledBy');

    const filterStub = {
      queryParams$: of({}),
      airportSnapshot: [],
      dateFromSnapshot: '',
      toggleService: toggleServiceSpy,
      toggleFlight: toggleFlightSpy,
      setHandledBy: setHandledBySpy,
    };
    const dataStub = {
      serviceBreakupSankey: () => of({ nodes: [], links: [] }),
      serviceTypeMatrix: () => of({ serviceTypes: [], rows: [] }),
      topRoutes: () => of({ items: [] }),
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

  it('onSankeyNodeClick routes "Self" to setHandledBy([SELF])', () => {
    fixture.componentInstance.onSankeyNodeClick('Self');
    expect(setHandledBySpy).toHaveBeenCalledWith(['SELF']);
  });

  it('onSankeyNodeClick routes "Outsourced" to setHandledBy([OUTSOURCED])', () => {
    fixture.componentInstance.onSankeyNodeClick('Outsourced');
    expect(setHandledBySpy).toHaveBeenCalledWith(['OUTSOURCED']);
  });

  it('onSankeyNodeClick routes a known service code to toggleService', () => {
    fixture.componentInstance.monthlyMixKeys$.next(['WCHR', 'WCHC']);
    fixture.componentInstance.onSankeyNodeClick('WCHR');
    expect(toggleServiceSpy).toHaveBeenCalledWith('WCHR');
  });

  it('onSankeyNodeClick falls through to toggleFlight for unknown names', () => {
    fixture.componentInstance.monthlyMixKeys$.next(['WCHR']);
    fixture.componentInstance.onSankeyNodeClick('AI102');
    expect(toggleFlightSpy).toHaveBeenCalledWith('AI102');
  });

  it('onSankeyNodeClick ignores the "Other flights" pseudo-node', () => {
    fixture.componentInstance.onSankeyNodeClick('Other flights');
    expect(toggleFlightSpy).not.toHaveBeenCalled();
    expect(toggleServiceSpy).not.toHaveBeenCalled();
    expect(setHandledBySpy).not.toHaveBeenCalled();
  });
});
