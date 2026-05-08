import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastMessage {
  id: number;
  text: string;
}

/**
 * Lightweight toast queue. BehaviorSubject so subscribers (the
 * <app-toast-container>) get the current list immediately on
 * connect, plus every subsequent change. Auto-dismiss after
 * AUTO_DISMISS_MS — no PrimeNG MessageService dependency.
 *
 * Mirrors the Angular 17 main implementation (signal-based) one-
 * for-one: same nextId counter, same auto-dismiss timeout, same
 * dismiss-by-id behaviour.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly AUTO_DISMISS_MS = 2500;
  private _toasts$ = new BehaviorSubject<ToastMessage[]>([]);

  toasts$: Observable<ToastMessage[]> = this._toasts$.asObservable();

  /**
   * Synchronous read of the current toast list. Tests use this to
   * assert state without subscribing to the observable.
   */
  get toastsSnapshot(): ToastMessage[] { return this._toasts$.value; }

  show(text: string): void {
    const id = this.nextId++;
    this._toasts$.next([...this._toasts$.value, { id, text }]);
    setTimeout(() => this.dismiss(id), this.AUTO_DISMISS_MS);
  }

  dismiss(id: number): void {
    this._toasts$.next(this._toasts$.value.filter(t => t.id !== id));
  }
}
