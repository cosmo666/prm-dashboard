import { TestBed } from '@angular/core/testing';
import { SavedViewsStore, SavedView } from './saved-views.store';

const baseFilters = (): SavedView['filters'] => ({
  airport: ['DEL'],
  datePreset: 'mtd',
  dateFrom: '2026-03-01',
  dateTo: '2026-03-31',
  airline: [],
  service: [],
  handledBy: [],
});

describe('SavedViewsStore', () => {
  let store: SavedViewsStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.get(SavedViewsStore);
  });

  afterEach(() => { localStorage.clear(); });

  it('starts empty when localStorage is clear', () => {
    expect(store.countSnapshot).toBe(0);
  });

  it('save() adds a view and returns it', () => {
    const v = store.save('My MTD', baseFilters());
    expect(store.countSnapshot).toBe(1);
    expect(store.viewsSnapshot[0].name).toBe('My MTD');
    expect(v.id).toBeTruthy();
  });

  it('save() prepends new views (most recent first)', () => {
    store.save('First',  baseFilters());
    store.save('Second', baseFilters());
    expect(store.viewsSnapshot.map(v => v.name)).toEqual(['Second', 'First']);
  });

  it('save() writes to localStorage', () => {
    store.save('Persisted', baseFilters());
    const raw = localStorage.getItem('prm-saved-views');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Persisted');
  });

  it('save() trims whitespace from the name', () => {
    const v = store.save('   Trimmed   ', baseFilters());
    expect(v.name).toBe('Trimmed');
  });

  it('delete() removes the view by id', () => {
    const v = store.save('Delete me', baseFilters());
    store.delete(v.id);
    expect(store.countSnapshot).toBe(0);
  });

  it('clear() empties the list', () => {
    store.save('A', baseFilters());
    store.save('B', baseFilters());
    store.clear();
    expect(store.countSnapshot).toBe(0);
  });

  it('hydrates from localStorage on init', () => {
    store.save('Prior', baseFilters());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.get(SavedViewsStore);
    expect(fresh.countSnapshot).toBe(1);
    expect(fresh.viewsSnapshot[0].name).toBe('Prior');
  });

  it('migrates legacy single-string airport into an array', () => {
    // Hand-write a legacy entry to localStorage and re-init the store.
    const legacy = [{
      id: 'legacy_1',
      name: 'Old',
      createdAt: 0,
      filters: {
        airport: 'BLR',
        airline: 'AI',
        datePreset: 'mtd',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      },
    }];
    localStorage.setItem('prm-saved-views', JSON.stringify(legacy));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.get(SavedViewsStore);
    expect(fresh.viewsSnapshot[0].filters.airport).toEqual(['BLR']);
    expect(fresh.viewsSnapshot[0].filters.airline).toEqual(['AI']);
  });

  it('drops malformed entries on load (no id, no name)', () => {
    const malformed = [
      { id: 'good', name: 'Good', createdAt: 0, filters: { datePreset: 'mtd', dateFrom: '', dateTo: '' } },
      { id: 42 }, // bad id type
      { name: 'No id' },
    ];
    localStorage.setItem('prm-saved-views', JSON.stringify(malformed));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.get(SavedViewsStore);
    expect(fresh.countSnapshot).toBe(1);
    expect(fresh.viewsSnapshot[0].id).toBe('good');
  });
});
