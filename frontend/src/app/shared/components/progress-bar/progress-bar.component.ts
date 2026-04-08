import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressService } from '../../../core/progress/progress.service';

/**
 * Thin 1px top-of-viewport progress bar that animates while background work
 * is in flight. Uses the Operations Desk cobalt accent.
 */
@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress" [class.progress--active]="progress.active()" aria-hidden="true">
      <div class="progress__bar"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .progress {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 200ms ease;
    }

    .progress--active {
      opacity: 1;
    }

    .progress__bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 30%;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--accent) 50%,
        transparent 100%
      );
      animation: progressSlide 1400ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    @keyframes progressSlide {
      0%   { left: -30%; }
      100% { left: 100%; }
    }
  `],
})
export class ProgressBarComponent {
  progress = inject(ProgressService);
}
