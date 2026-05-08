import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface SavedView {
  id: string;
  name: string;
  createdAt: number;
  filters: {
    airport?: string[];
    datePreset: string;
    dateFrom: string;
    dateTo: string;
    airline?: string[];
    service?: string[];
    handledBy?: string[];
  };
}

const STORAGE_KEY = 'prm-saved-views';

/**
 * Read the persisted views list. Defensive: anything missing or
 * malformed produces an empty array rather than throwing — we'd
 * rather lose a corrupted entry than break the dashboard chrome.
 */
function loadFromStorage(): SavedView[] {
  if (typeof window === 'undefined') { return []; }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return []; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { return []; }
    return parsed
      .filter((v: any) => v && typeof v.id === 'string' && typeof v.name === 'string')
      .map((v: any) => migrateLegacyFilters(v));
  } catch (_) {
    return [];
  }
}

/**
 * Coerce filter fields written by an older revision (single-valued
 * airport / airline as a bare string) into the current array form.
 * Idempotent: arrays stay arrays. Drops empty strings inside the
 * input arrays so a saved view with `["", "DEL"]` becomes `["DEL"]`.
 */
function migrateLegacyFilters(v: any): SavedView {
  const f = v.filters || {};
  const toArray = (x: any): string[] => {
    if (Array.isArray(x)) {
      return x.filter((s: any) => typeof s === 'string' && s.length > 0);
    }
    if (typeof x === 'string' && x.length > 0) { return [x]; }
    return [];
  };
  return {
    id: v.id,
    name: v.name,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    filters: {
      airport:    toArray(f.airport),
      datePreset: f.datePreset || 'custom',
      dateFrom:   f.dateFrom   || '',
      dateTo:     f.dateTo     || '',
      airline:    toArray(f.airline),
      service:    toArray(f.service),
      handledBy:  toArray(f.handledBy),
    },
  };
}

function uuid(): string {
  return 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

@Injectable({ providedIn: 'root' })
export class SavedViewsStore {
  private _views$ = new BehaviorSubject<SavedView[]>(loadFromStorage());

  views$: Observable<SavedView[]> = this._views$.asObservable();

  get viewsSnapshot(): SavedView[] { return this._views$.value; }
  get countSnapshot(): number { return this._views$.value.length; }

  constructor() {
    // Persist on every emission. Wrapped because Safari private-mode +
    // disk-full both reject setItem and we don't want a single failed
    // write to crash the dashboard chrome.
    this._views$.subscribe(list => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (_) { /* swallow */ }
    });
  }

  /**
   * Save the supplied filter snapshot under `name`. New views go to
   * the FRONT of the list so the most recently saved is the most
   * immediately visible in the menu.
   */
  save(name: string, filters: SavedView['filters']): SavedView {
    const view: SavedView = {
      id: uuid(),
      name: name.trim(),
      createdAt: Date.now(),
      filters: {
        airport:    (filters.airport    || []).slice(),
        datePreset: filters.datePreset,
        dateFrom:   filters.dateFrom,
        dateTo:     filters.dateTo,
        airline:    (filters.airline    || []).slice(),
        service:    (filters.service    || []).slice(),
        handledBy:  (filters.handledBy  || []).slice(),
      },
    };
    this._views$.next([view].concat(this._views$.value));
    return view;
  }

  delete(id: string): void {
    this._views$.next(this._views$.value.filter(v => v.id !== id));
  }

  clear(): void { this._views$.next([]); }
}
