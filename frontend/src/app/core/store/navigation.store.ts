import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

/**
 * Tracks the active dashboard tab title for the top-bar breadcrumb,
 * AND exposes a tab-switch request stream consumed by DashboardComponent.
 *
 * The tab-switch stream uses a (index, tick) tuple so that re-requesting
 * the currently-active tab still emits — `distinctUntilChanged` on a
 * plain index would swallow same-index re-requests, which would break
 * "press Cmd+K → choose Overview when already on Overview" as a
 * focus-restoring no-op.
 *
 * Plain BehaviorSubject service per Angular-8 conventions (no NgRx,
 * no signals). Provided in root so the top bar, command palette, and
 * dashboard component all share the same instance.
 */
@Injectable({ providedIn: 'root' })
export class NavigationStore {
  private _activeTitle$ = new BehaviorSubject<string>('');
  activeTitle$ = this._activeTitle$.asObservable();

  // ----- tab-switch request channel -----

  private _requestedTabIndex$ = new BehaviorSubject<number | null>(null);
  private _requestedTabTick$  = new BehaviorSubject<number>(0);

  /**
   * Emits a fresh object on every requestTab() call, even when the
   * supplied index matches the current one. Subscribers can rely on
   * each emission being a NEW reference (the inner `tick` field
   * advances per call).
   */
  requestedTab$: Observable<{ index: number; tick: number } | null> = combineLatest([
    this._requestedTabIndex$,
    this._requestedTabTick$,
  ]).pipe(
    map(([index, tick]) => (index === null ? null : { index, tick })),
    shareReplay(1),
  );

  get activeTitleSnapshot(): string { return this._activeTitle$.value; }

  setActiveTitle(title: string): void {
    this._activeTitle$.next(title || '');
  }

  /**
   * Ask the dashboard to switch to tab `index`. The dashboard
   * component subscribes to requestedTab$ and translates the index
   * into a router.navigate([tab.route]) call.
   */
  requestTab(index: number): void {
    this._requestedTabIndex$.next(index);
    this._requestedTabTick$.next(this._requestedTabTick$.value + 1);
  }
}
