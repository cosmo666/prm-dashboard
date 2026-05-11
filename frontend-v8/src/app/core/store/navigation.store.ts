import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Tracks the active dashboard tab title for the top-bar breadcrumb.
 *
 * Plain BehaviorSubject service per Angular-8 conventions (no NgRx,
 * no signals). Provided in root so the top bar and dashboard
 * component share the same instance.
 */
@Injectable({ providedIn: 'root' })
export class NavigationStore {
  private _activeTitle$ = new BehaviorSubject<string>('');
  activeTitle$ = this._activeTitle$.asObservable();

  get activeTitleSnapshot(): string { return this._activeTitle$.value; }

  setActiveTitle(title: string): void {
    this._activeTitle$.next(title || '');
  }
}
