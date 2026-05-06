import { TestBed } from '@angular/core/testing';
import { take } from 'rxjs/operators';

import { FilterStore } from './filter.store';

describe('FilterStore', () => {
  let store: FilterStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FilterStore] });
    store = TestBed.get(FilterStore);
  });

  it('starts with empty arrays / strings and datePreset === "mtd"', () => {
    expect(store.airportSnapshot).toEqual([]);
    expect(store.airlineSnapshot).toEqual([]);
    expect(store.serviceSnapshot).toEqual([]);
    expect(store.handledBySnapshot).toEqual([]);
    expect(store.dateFromSnapshot).toBe('');
    expect(store.dateToSnapshot).toBe('');
    expect(store.flightSnapshot).toBe('');
    expect(store.agentNoSnapshot).toBe('');
    expect(store.datePresetSnapshot).toBe('mtd');
  });

  // -------------------- airport --------------------

  it('setAirport(["DEL","BOM"]) → airportSnapshot === ["DEL","BOM"]', () => {
    store.setAirport(['DEL', 'BOM']);
    expect(store.airportSnapshot).toEqual(['DEL', 'BOM']);
  });

  it('setAirport("DEL") wraps a single string into a one-element array', () => {
    store.setAirport('DEL');
    expect(store.airportSnapshot).toEqual(['DEL']);
  });

  it('setAirport(null) → airportSnapshot === []', () => {
    store.setAirport(['DEL']);
    store.setAirport(null);
    expect(store.airportSnapshot).toEqual([]);
  });

  it('toggleAirport adds when absent and removes when present', () => {
    store.setAirport(['BOM']);
    store.toggleAirport('DEL');
    expect(store.airportSnapshot).toEqual(['BOM', 'DEL']);
    store.toggleAirport('DEL');
    expect(store.airportSnapshot).toEqual(['BOM']);
  });

  it('toggleAirport is a no-op when it would empty the array (never-empty rule)', () => {
    store.setAirport(['DEL']);
    store.toggleAirport('DEL');
    expect(store.airportSnapshot).toEqual(['DEL']);
  });

  it('removeAirport filters out, but is a no-op when length === 1', () => {
    store.setAirport(['DEL', 'BOM']);
    store.removeAirport('DEL');
    expect(store.airportSnapshot).toEqual(['BOM']);
    // Now only BOM left — should not get removed.
    store.removeAirport('BOM');
    expect(store.airportSnapshot).toEqual(['BOM']);
  });

  // -------------------- airline / service --------------------

  it('setAirline(["AI","BA"]) populates the array', () => {
    store.setAirline(['AI', 'BA']);
    expect(store.airlineSnapshot).toEqual(['AI', 'BA']);
  });

  it('toggleAirline adds to empty list and removes again (no never-empty rule)', () => {
    store.toggleAirline('AI');
    expect(store.airlineSnapshot).toEqual(['AI']);
    store.toggleAirline('AI');
    expect(store.airlineSnapshot).toEqual([]);
  });

  it('toggleService round-trips identically', () => {
    store.toggleService('WCHR');
    expect(store.serviceSnapshot).toEqual(['WCHR']);
    store.toggleService('WCHR');
    expect(store.serviceSnapshot).toEqual([]);
  });

  // -------------------- clearSecondary --------------------

  it('clearSecondary empties airline/service/handledBy/flight/agentNo but keeps airport+date', () => {
    store.setAirport(['DEL']);
    store.setDateRange('mtd', '2026-04-01', '2026-04-30');
    store.setAirline(['AI']);
    store.setService(['WCHR']);
    store.setHandledBy(['Indigo Ground']);
    store.setFlight('AI101');
    store.setAgentNo('A123');

    store.clearSecondary();

    expect(store.airportSnapshot).toEqual(['DEL']);
    expect(store.dateFromSnapshot).toBe('2026-04-01');
    expect(store.dateToSnapshot).toBe('2026-04-30');
    expect(store.datePresetSnapshot).toBe('mtd');

    expect(store.airlineSnapshot).toEqual([]);
    expect(store.serviceSnapshot).toEqual([]);
    expect(store.handledBySnapshot).toEqual([]);
    expect(store.flightSnapshot).toBe('');
    expect(store.agentNoSnapshot).toBe('');
  });

  // -------------------- queryParams$ --------------------

  it('queryParams$ emits the full dict for a populated state', () => {
    store.setAirport(['DEL', 'BOM']);
    store.setDateRange('custom', '2026-04-01', '2026-04-30');
    store.setAirline(['AI']);
    store.setService(['WCHR']);
    store.setHandledBy(['Indigo Ground']);
    store.setFlight('AI101');
    store.setAgentNo('A123');

    let last: { [key: string]: string } | undefined;
    store.queryParams$.pipe(take(1)).subscribe(p => { last = p; });

    expect(last).toEqual({
      airport: 'DEL,BOM',
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      airline: 'AI',
      service: 'WCHR',
      handled_by: 'Indigo Ground',
      flight: 'AI101',
      agent_no: 'A123',
    });
  });

  it('queryParams$ omits keys for empty arrays / empty strings', () => {
    let last: { [key: string]: string } | undefined;
    store.queryParams$.pipe(take(1)).subscribe(p => { last = p; });
    expect(last).toEqual({});
  });

  // -------------------- hydrateFromQueryParams --------------------

  it('hydrateFromQueryParams populates known keys correctly', () => {
    store.hydrateFromQueryParams({
      airport: 'DEL,BOM',
      date_from: '2026-04-01',
    });
    expect(store.airportSnapshot).toEqual(['DEL', 'BOM']);
    expect(store.dateFromSnapshot).toBe('2026-04-01');
  });

  it('hydrateFromQueryParams parseCsv trims and drops empties', () => {
    store.hydrateFromQueryParams({ airport: ',  ,DEL' });
    expect(store.airportSnapshot).toEqual(['DEL']);
  });

  it('hydrateFromQueryParams sets datePreset === "custom" if a date is hydrated', () => {
    store.hydrateFromQueryParams({ date_from: '2026-04-01' });
    expect(store.datePresetSnapshot).toBe('custom');
  });

  // -------------------- applyDefault --------------------

  it('applyDefault produces a yyyy-mm-01 → yyyy-mm-DD MTD range', () => {
    store.applyDefault();
    const from = store.dateFromSnapshot;
    const to   = store.dateToSnapshot;
    expect(store.datePresetSnapshot).toBe('mtd');
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Same year-month on both ends.
    expect(from.substring(0, 7)).toBe(to.substring(0, 7));
  });
});
