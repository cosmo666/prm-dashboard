import { Injectable, signal, computed } from '@angular/core';

/**
 * Tiny progress service — tracks in-flight "background" operations
 * (silent auth refresh, initial tenant resolution, etc).
 * UI components can subscribe to `active` to show a thin top bar.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly _inflight = signal(0);

  readonly active = computed(() => this._inflight() > 0);

  start(): void {
    this._inflight.update((n) => n + 1);
  }

  stop(): void {
    this._inflight.update((n) => Math.max(0, n - 1));
  }

  /** Run a promise/async fn with start/stop bracketing. */
  async wrap<T>(fn: () => Promise<T>): Promise<T> {
    this.start();
    try {
      return await fn();
    } finally {
      this.stop();
    }
  }
}
