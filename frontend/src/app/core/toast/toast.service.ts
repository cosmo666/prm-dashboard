import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly AUTO_DISMISS_MS = 2500;

  readonly toasts = signal<ToastMessage[]>([]);

  show(text: string): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, text }]);
    setTimeout(() => this.dismiss(id), this.AUTO_DISMISS_MS);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
