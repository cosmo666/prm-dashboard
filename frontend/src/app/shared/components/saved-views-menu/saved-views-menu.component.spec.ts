import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of } from 'rxjs';

import { SavedViewsMenuComponent } from './saved-views-menu.component';
import { SavedViewsStore, SavedView } from '../../../core/store/saved-views.store';
import { FilterStore } from '../../../core/store/filter.store';
import { ToastService } from '../../../core/toast/toast.service';

// Hand-rolled stubs over jasmine spies — keeps the spec readable and
// avoids having to satisfy the full FilterStore surface area for tests
// that only touch a few snapshot getters.
const filterStub = {
  airportSnapshot:    ['DEL'],
  datePresetSnapshot: 'mtd',
  dateFromSnapshot:   '2026-03-01',
  dateToSnapshot:     '2026-03-31',
  airlineSnapshot:    [],
  serviceSnapshot:    [],
  handledBySnapshot:  [],
  hydrateFromQueryParams: jasmine.createSpy('hydrateFromQueryParams'),
  setDateRange:           jasmine.createSpy('setDateRange'),
};

const storeStub = {
  views$: of([] as SavedView[]),
  countSnapshot: 0,
  viewsSnapshot: [] as SavedView[],
  save: jasmine.createSpy('save'),
  delete: jasmine.createSpy('delete'),
};

const toastStub = { show: jasmine.createSpy('show') };

describe('SavedViewsMenuComponent', () => {
  let fixture: any;
  let component: SavedViewsMenuComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [SavedViewsMenuComponent],
      providers: [
        { provide: SavedViewsStore, useValue: storeStub },
        { provide: FilterStore,    useValue: filterStub },
        { provide: ToastService,   useValue: toastStub },
      ],
      // <p-overlayPanel>, <i class="pi pi-*">, etc. — the spec exercises
      // the component logic, not the PrimeNG primitives, so we ignore
      // unknown elements/attrs at the template-compile boundary.
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(SavedViewsMenuComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('canSave() is false when draftName is empty', () => {
    component.draftName = '';
    expect(component.canSave()).toBe(false);
  });

  it('canSave() is true when draftName has non-whitespace content', () => {
    component.draftName = 'My View';
    expect(component.canSave()).toBe(true);
  });

  it('canSave() treats whitespace-only as empty', () => {
    component.draftName = '   ';
    expect(component.canSave()).toBe(false);
  });

  it('describe() produces a dot-separated summary', () => {
    const v: SavedView = {
      id: 'v_1', name: 'Test', createdAt: 0,
      filters: {
        airport: ['DEL'], datePreset: 'mtd',
        dateFrom: '2026-03-01', dateTo: '2026-03-31',
        airline: ['AI'],
      },
    };
    const desc = component.describe(v);
    expect(desc).toContain('DEL');
    expect(desc).toContain('MTD');
    expect(desc).toContain('AI');
    expect(desc.split(' · ').length).toBe(3);
  });

  it('describe() summarises multi-value filters as "X +N"', () => {
    const v: SavedView = {
      id: 'v_2', name: 'Multi', createdAt: 0,
      filters: {
        datePreset: 'last7', dateFrom: '', dateTo: '',
        airline: ['AI', 'BA', 'CX'],
      },
    };
    expect(component.describe(v)).toContain('AI +2');
  });

  it('isActive() returns true when filters match the FilterStore snapshot', () => {
    const v: SavedView = {
      id: 'v_3', name: 'Match', createdAt: 0,
      filters: {
        airport: ['DEL'], datePreset: 'mtd',
        dateFrom: '2026-03-01', dateTo: '2026-03-31',
        airline: [], service: [], handledBy: [],
      },
    };
    expect(component.isActive(v)).toBe(true);
  });

  it('isActive() returns false when any field differs', () => {
    const v: SavedView = {
      id: 'v_4', name: 'NoMatch', createdAt: 0,
      filters: {
        airport: ['BLR'], datePreset: 'mtd',
        dateFrom: '2026-03-01', dateTo: '2026-03-31',
      },
    };
    expect(component.isActive(v)).toBe(false);
  });
});
