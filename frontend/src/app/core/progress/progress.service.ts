import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/**
 * In-flight HTTP request counter for the global 2px top progress bar.
 * Callers wrap async work with start() + stop() (typically via
 * `finalize(() => stop())` in an RxJS pipeline). The bar shows whenever
 * the counter is > 0 and hides on the way back to 0.
 *
 * `distinctUntilChanged` collapses bursts of start/stop on the boolean
 * output so the bar doesn't flicker when several requests overlap.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private _inflight$ = new BehaviorSubject<number>(0);

  active$: Observable<boolean> = this._inflight$.pipe(
    map(n => n > 0),
    distinctUntilChanged(),
  );

  get activeSnapshot(): boolean { return this._inflight$.value > 0; }

  start(): void { this._inflight$.next(this._inflight$.value + 1); }

  /**
   * Decrement the counter, clamped at 0 — a stray stop() before start()
   * must not put the counter into negative territory (would otherwise
   * hold the bar open forever once a real start() arrives).
   */
  stop(): void { this._inflight$.next(Math.max(0, this._inflight$.value - 1)); }
}
