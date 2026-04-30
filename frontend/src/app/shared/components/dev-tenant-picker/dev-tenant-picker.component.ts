import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { take, catchError, of, finalize } from 'rxjs';
import { TooltipDirective } from '../../directives/tooltip.directive';
import { ApiClient } from '../../../core/api/api.client';
import { AuthStore } from '../../../core/store/auth.store';

/**
 * Dev-only tenant picker — appears in the top bar when the app is running on
 * localhost so you can switch between the three seeded POC tenants without
 * editing environment.ts or touching your hosts file. Writes the selected
 * slug to localStorage under `prm-dev-tenant-slug`; the tenant resolver
 * prefers that over environment.defaultTenantSlug on localhost.
 *
 * Hidden on any real hostname — the component simply renders nothing, so this
 * never bleeds into production.
 */

export const DEV_TENANT_STORAGE_KEY = 'prm-dev-tenant-slug';

interface DevTenant {
  slug: string;
  name: string;
}

// Hardcoded to the three seed tenants in data/master/tenants.csv.
// A new real tenant arrives via subdomain in production and doesn't need this
// dev affordance.
const DEV_TENANTS: readonly DevTenant[] = [
  { slug: 'aeroground', name: 'AeroGround Services' },
  { slug: 'skyserve', name: 'SkyServe Handling' },
  { slug: 'globalprm', name: 'GlobalPRM' },
];

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function readDevTenantOverride(): string | null {
  if (!isLocalHost()) return null;
  try {
    const slug = localStorage.getItem(DEV_TENANT_STORAGE_KEY);
    if (!slug) return null;
    // Validate against the known list so a stale/bad value doesn't break the app.
    return DEV_TENANTS.some((t) => t.slug === slug) ? slug : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-dev-tenant-picker',
  standalone: true,
  imports: [CommonModule, MatMenuModule, TooltipDirective],
  template: `
    @if (visible) {
      <button
        class="devpick"
        type="button"
        [matMenuTriggerFor]="devMenu"
        [appTooltip]="'Switch tenant (dev only)'"
        tooltipPosition="bottom"
        aria-label="Developer tenant picker">
        <span class="devpick__tag">DEV</span>
        <span class="devpick__sep">·</span>
        <span class="devpick__slug font-data">{{ activeSlug }}</span>
        <svg class="devpick__caret" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <mat-menu #devMenu="matMenu" xPosition="before" class="devpick-menu">
        <div class="devpick-menu__wrap">
          <div class="devpick-menu__head">
            <div class="label-micro">Dev tenant</div>
            <div class="devpick-menu__hint">Switching signs you out</div>
          </div>
          @for (t of tenants; track t.slug) {
            <button
              mat-menu-item
              type="button"
              class="devpick-menu__item"
              [class.is-active]="t.slug === activeSlug"
              (click)="switchTo(t.slug)">
              <div class="devpick-menu__slug font-data">{{ t.slug }}</div>
              <div class="devpick-menu__name">{{ t.name }}</div>
              @if (t.slug === activeSlug) {
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" class="devpick-menu__check">
                  <path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              }
            </button>
          }
        </div>
      </mat-menu>
    }
  `,
  styles: [`
    :host { display: contents; }

    .devpick {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 10px;
      background: var(--surface);
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      color: var(--muted);
      cursor: pointer;
      font-family: var(--font-sans);
      transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
    }

    .devpick:hover {
      border-color: var(--ink);
      color: var(--ink);
      background: var(--surface-2);
    }

    .devpick__tag {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      padding: 2px 5px;
      border-radius: 3px;
      background: var(--warning);
      color: #fafaf7;
      text-transform: uppercase;
    }

    .devpick__sep {
      color: var(--border-strong);
      font-weight: 400;
    }

    .devpick__slug {
      font-size: 12px;
      font-weight: 500;
      color: var(--ink);
      letter-spacing: 0.01em;
    }

    .devpick__caret {
      color: var(--muted);
      margin-left: 2px;
    }

    // Menu styling — same editorial language as the airport selector menu
    :host ::ng-deep .devpick-menu {
      min-width: 260px !important;
    }

    :host ::ng-deep .devpick-menu__wrap {
      padding: 6px;
    }

    :host ::ng-deep .devpick-menu__head {
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    :host ::ng-deep .devpick-menu__hint {
      font-size: 10px;
      color: var(--muted);
      font-style: italic;
    }

    :host ::ng-deep .devpick-menu__item {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 10px 12px !important;
      border-radius: 6px !important;
      margin: 1px 0 !important;
      min-height: auto !important;
      line-height: 1.2 !important;
      font-family: var(--font-sans) !important;
    }

    :host ::ng-deep .devpick-menu__item.is-active {
      background: var(--accent-bg) !important;
    }

    :host ::ng-deep .devpick-menu__slug {
      font-family: var(--font-mono) !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      color: var(--ink) !important;
      min-width: 80px !important;
    }

    :host ::ng-deep .devpick-menu__name {
      flex: 1 !important;
      font-size: 12px !important;
      color: var(--muted) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    :host ::ng-deep .devpick-menu__check {
      color: var(--accent-fg) !important;
      flex-shrink: 0;
    }
  `],
})
export class DevTenantPickerComponent {
  private api = inject(ApiClient);
  private authStore = inject(AuthStore);

  readonly visible = isLocalHost();
  readonly tenants = DEV_TENANTS;

  get activeSlug(): string {
    return readDevTenantOverride() ?? 'aeroground';
  }

  switchTo(slug: string): void {
    if (slug === this.activeSlug) return;

    try {
      localStorage.setItem(DEV_TENANT_STORAGE_KEY, slug);
    } catch {
      // localStorage unavailable — fall through; hard reload below will still
      // use the default tenant, which is not the user's choice but avoids a
      // dead button.
    }

    // Revoke server-side refresh cookie, clear the in-memory access token,
    // then force a hard reload so the resolver re-runs against the new slug
    // and all signal-store state is discarded cleanly.
    this.api.post('/auth/logout').pipe(
      take(1),
      catchError(() => of(null)),
      finalize(() => {
        this.authStore.clear();
        window.location.assign('/login');
      }),
    ).subscribe();
  }
}
