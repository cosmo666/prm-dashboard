import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { TenantStore, Tenant } from './core/store/tenant.store';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
  styles: [':host { display: block; min-height: 100vh; }'],
})
export class AppComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private tenantStore: TenantStore) {}

  ngOnInit(): void {
    // Apply per-tenant primary color as a CSS variable on :root so every
    // .ui-* override and .kpi-card etc. picks it up automatically. The
    // hover/active/soft/softer variants are derived in CSS via color-mix().
    this.tenantStore.tenant$.pipe(
      distinctUntilChanged((a, b) => this.colorOf(a) === this.colorOf(b)),
      takeUntil(this.destroy$),
    ).subscribe(t => {
      const color = this.colorOf(t);
      if (color) {
        document.documentElement.style.setProperty('--app-primary', color);
        document.documentElement.style.setProperty('--tenant-primary', color);
      } else {
        document.documentElement.style.removeProperty('--app-primary');
        document.documentElement.style.removeProperty('--tenant-primary');
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private colorOf(t: Tenant | null): string | null {
    return t && t.primaryColor ? t.primaryColor : null;
  }
}
