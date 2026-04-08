import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/toast/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" (click)="toast.dismiss(t.id)">
          <span class="toast__dot" aria-hidden="true"></span>
          <span class="toast__text">{{ t.text }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 10000;
      pointer-events: none;
    }

    .toast-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }

    .toast {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--ink);
      color: #fafaf9;
      font-family: var(--font-sans, "IBM Plex Sans", sans-serif);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.01em;
      border-radius: 6px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.12);
      pointer-events: auto;
      cursor: pointer;
      animation: toastIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
      max-width: 360px;
    }

    .toast__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent, #2563eb);
      flex-shrink: 0;
    }

    .toast__text {
      line-height: 1.35;
    }

    @keyframes toastIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `],
})
export class ToastContainerComponent {
  toast = inject(ToastService);
}
