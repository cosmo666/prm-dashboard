import { Injectable, signal, computed, effect } from '@angular/core';

/**
 * A saved filter "view" — a named snapshot of the dashboard filter state
 * that the user can restore later with one click. Persisted to localStorage.
 */
export interface SavedView {
  id: string;
  name: string;
  createdAt: number;
  filters: {
    airport?: string;
    datePreset: string;
    dateFrom: string;
    dateTo: string;
    airline?: string;
    service?: string;
    handledBy?: string;
  };
}

const STORAGE_KEY = 'prm-saved-views';

/**
 * Signal-backed store for saved filter views. Plain Injectable (rather than
 * signalStore) because we need a constructor lifecycle for localStorage
 * hydration and reactive persistence — cleaner than signalStore hooks here.
 */
@Injectable({ providedIn: 'root' })
export class SavedViewsStore {
  private readonly _views = signal<SavedView[]>(this.loadFromStorage());

  readonly views = computed(() => this._views());
  readonly count = computed(() => this._views().length);

  constructor() {
    // Persist to localStorage on every change
    effect(() => {
      const list = this._views();
      if (typeof window === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch { /* storage unavailable or quota exceeded */ }
    });
  }

  save(name: string, filters: SavedView['filters']): SavedView {
    const view: SavedView = {
      id: this.uuid(),
      name: name.trim(),
      createdAt: Date.now(),
      filters: { ...filters },
    };
    this._views.update((list) => [view, ...list]);
    return view;
  }

  delete(id: string): void {
    this._views.update((list) => list.filter((v) => v.id !== id));
  }

  clear(): void {
    this._views.set([]);
  }

  private loadFromStorage(): SavedView[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string');
    } catch {
      return [];
    }
  }

  private uuid(): string {
    // Small non-crypto uuid sufficient for local storage identity
    return 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
}
