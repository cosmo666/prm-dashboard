import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { TenantStore } from '../store/tenant.store';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'prm-theme';

/**
 * Global theme service — persists to localStorage, writes data-theme attribute
 * on <html>, and supports system preference as a fallback.
 * Also publishes the current tenant's primary color as `--tenant-accent`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.getInitialTheme());
  private readonly tenantStore = inject(TenantStore);

  readonly theme = computed(() => this._theme());
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    // Apply theme to <html> whenever it changes
    effect(() => {
      const t = this._theme();
      if (typeof document === 'undefined') return;

      // Briefly suppress transitions on switch to prevent visual jank
      document.documentElement.classList.add('no-theme-transition');
      document.documentElement.setAttribute('data-theme', t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch { /* localStorage unavailable */ }

      // Re-enable transitions after the browser has painted the new values
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('no-theme-transition');
        });
      });
    });

    // Push the current tenant's primary color into a CSS custom property
    effect(() => {
      const color = this.tenantStore.primaryColor();
      if (typeof document === 'undefined' || !color) return;
      document.documentElement.style.setProperty('--tenant-accent', color);
      document.documentElement.style.setProperty('--tenant-accent-soft', this.withAlpha(color, 0.12));
    });
  }

  private withAlpha(hex: string, alpha: number): string {
    // #RRGGBB -> rgba(r, g, b, a)
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: Theme): void {
    this._theme.set(theme);
  }

  private getInitialTheme(): Theme {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }
    // Fall back to system preference
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
}
