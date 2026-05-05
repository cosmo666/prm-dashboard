import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

export interface Tenant {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

@Injectable({ providedIn: 'root' })
export class TenantStore {
  private _tenant$ = new BehaviorSubject<Tenant | null>(null);

  tenant$: Observable<Tenant | null> = this._tenant$.asObservable();
  slug$: Observable<string | null> = this._tenant$.pipe(
    map(t => (t ? t.slug : null)),
    shareReplay(1)
  );

  get tenantSnapshot(): Tenant | null { return this._tenant$.value; }
  get slugSnapshot(): string | null {
    const t = this._tenant$.value;
    return t ? t.slug : null;
  }

  setTenant(t: Tenant | null): void { this._tenant$.next(t); }
  clear(): void { this._tenant$.next(null); }
}
