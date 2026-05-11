import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'app.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _mode$ = new BehaviorSubject<ThemeMode>(this.initialMode());

  mode$: Observable<ThemeMode> = this._mode$.asObservable();

  get modeSnapshot(): ThemeMode { return this._mode$.value; }

  setTheme(mode: ThemeMode): void {
    const link = document.getElementById('app-theme') as HTMLLinkElement | null;
    if (link) {
      link.href = mode === 'dark'
        ? 'assets/themes/nova-dark/theme.css'
        : 'assets/themes/nova-light/theme.css';
    }
    document.body.setAttribute('data-theme', mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this._mode$.next(mode);
  }

  toggle(): void {
    this.setTheme(this.modeSnapshot === 'dark' ? 'light' : 'dark');
  }

  private initialMode(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
}
