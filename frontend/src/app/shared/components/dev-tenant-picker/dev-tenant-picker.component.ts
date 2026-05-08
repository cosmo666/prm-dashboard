import { Component } from '@angular/core';
import { of } from 'rxjs';
import { catchError, finalize, take } from 'rxjs/operators';
import { ApiClient } from 'src/app/core/api/api.client';
import { AuthStore } from 'src/app/core/store/auth.store';

export const DEV_TENANT_STORAGE_KEY = 'prm-dev-tenant-slug';

interface DevTenant { slug: string; name: string; }

// Hardcoded mirror of data/master/tenants.csv. Acceptable for a dev-
// only switcher — the picker self-hides on any non-localhost host.
const DEV_TENANTS: ReadonlyArray<DevTenant> = [
  { slug: 'aeroground', name: 'AeroGround Services' },
  { slug: 'skyserve',   name: 'SkyServe Handling' },
  { slug: 'globalprm',  name: 'GlobalPRM' },
];

function isLocalHost(): boolean {
  if (typeof window === 'undefined') { return false; }
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/**
 * Read the localStorage tenant override. Returns null on any non-
 * localhost host (so production can never accidentally serve the
 * dev tenant), null if the stored slug isn't in DEV_TENANTS, and
 * null on storage errors. Exported so TenantResolver can consult it.
 */
export function readDevTenantOverride(): string | null {
  if (!isLocalHost()) { return null; }
  try {
    const slug = localStorage.getItem(DEV_TENANT_STORAGE_KEY);
    if (!slug) { return null; }
    for (const t of DEV_TENANTS) {
      if (t.slug === slug) { return slug; }
    }
    return null;
  } catch (_) {
    return null;
  }
}

@Component({
  selector: 'app-dev-tenant-picker',
  templateUrl: './dev-tenant-picker.component.html',
  styleUrls: ['./dev-tenant-picker.component.scss'],
})
export class DevTenantPickerComponent {
  readonly visible = isLocalHost();
  readonly tenants = DEV_TENANTS;

  isMenuOpen = false;

  constructor(private api: ApiClient, private authStore: AuthStore) {}

  get activeSlug(): string {
    return readDevTenantOverride() || 'aeroground';
  }

  toggleMenu(): void { this.isMenuOpen = !this.isMenuOpen; }

  closeMenu(): void { this.isMenuOpen = false; }

  /**
   * Switch the dev tenant. Same-slug clicks are a no-op (just close
   * the menu). Different-slug clicks: write to localStorage, sign
   * out via /auth/logout, clear AuthStore, then hard-navigate to
   * /login so the next request resolves the new tenant from the
   * fresh override.
   */
  switchTo(slug: string): void {
    if (slug === this.activeSlug) {
      this.closeMenu();
      return;
    }
    try {
      localStorage.setItem(DEV_TENANT_STORAGE_KEY, slug);
    } catch (_) { /* storage rejection: best-effort, switch will fail soft */ }

    this.api.post('/auth/logout', {}).pipe(
      take(1),
      catchError(() => of(null)),
      finalize(() => {
        this.authStore.clear();
        this.doNavigate('/login');
      }),
    ).subscribe();
  }

  /**
   * Indirection so tests can replace navigation without spying on
   * window.location.assign (read-only in some test environments).
   */
  protected doNavigate(url: string): void {
    window.location.assign(url);
  }
}
