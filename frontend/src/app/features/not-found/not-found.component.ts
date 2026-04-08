import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="nf">
      <div class="nf__noise"></div>

      <div class="nf__inner">
        <header class="nf__head">
          <div class="label-micro">Error 404</div>
          <div class="nf__flight-id font-data">{{ flightId }}</div>
        </header>

        <div class="nf__hero">
          <div class="nf__code font-display">404</div>
          <h1 class="nf__title">
            Flight <em>diverted</em>.
          </h1>
          <p class="nf__tagline">
            The route you were looking for doesn't exist on this network.
            It may have been rescheduled, or the URL has been mistyped.
          </p>
        </div>

        <div class="nf__strip">
          <div class="nf__strip-item">
            <div class="label-micro">Origin</div>
            <div class="nf__strip-value font-data">{{ origin }}</div>
          </div>
          <div class="nf__strip-arrow">→</div>
          <div class="nf__strip-item">
            <div class="label-micro">Destination</div>
            <div class="nf__strip-value font-data nf__strip-value--muted">UNKNOWN</div>
          </div>
          <div class="nf__strip-divider"></div>
          <div class="nf__strip-item">
            <div class="label-micro">Status</div>
            <div class="nf__strip-value font-data nf__strip-value--bad">NOT FOUND</div>
          </div>
        </div>

        <footer class="nf__actions">
          <button class="nf__btn nf__btn--primary" (click)="goHome()">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M13 7H1M6 2L1 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Return to home</span>
          </button>
          <a routerLink="/dashboard" class="nf__btn nf__btn--ghost">
            <span>Go to dashboard</span>
          </a>
        </footer>
      </div>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg);
    }

    .nf {
      position: relative;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 40px 24px;
    }

    .nf__noise {
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/></svg>");
      opacity: 0.05;
      mix-blend-mode: multiply;
      pointer-events: none;
    }

    [data-theme="dark"] .nf__noise {
      opacity: 0.1;
      mix-blend-mode: overlay;
    }

    .nf__inner {
      width: 100%;
      max-width: 720px;
      display: flex;
      flex-direction: column;
      gap: 40px;
      animation: nfFadeUp 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .nf__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }

    .nf__flight-id {
      font-size: 11px;
      color: var(--muted);
    }

    .nf__hero {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .nf__code {
      font-family: var(--font-serif);
      font-variation-settings: 'opsz' 144;
      font-size: clamp(120px, 20vw, 220px);
      line-height: 0.82;
      font-weight: 200;
      color: var(--ink);
      letter-spacing: -0.04em;
      margin-bottom: 16px;
      animation: nfCodeEnter 1100ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both;
    }

    .nf__title {
      font-family: var(--font-serif);
      font-variation-settings: 'opsz' 72;
      font-size: clamp(36px, 4.5vw, 56px);
      line-height: 1;
      font-weight: 300;
      color: var(--ink);
      letter-spacing: -0.025em;

      em {
        font-style: italic;
        font-weight: 400;
      }
    }

    .nf__tagline {
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.6;
      color: var(--muted);
      max-width: 520px;
    }

    // Status strip
    .nf__strip {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 20px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .nf__strip-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nf__strip-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
    }

    .nf__strip-value--muted { color: var(--muted); }
    .nf__strip-value--bad { color: var(--danger); }

    .nf__strip-arrow {
      font-family: var(--font-mono);
      font-size: 18px;
      color: var(--border-strong);
    }

    .nf__strip-divider {
      width: 1px;
      height: 28px;
      background: var(--border);
      margin-left: auto;
    }

    // Actions
    .nf__actions {
      display: flex;
      gap: 10px;
    }

    .nf__btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 16px;
      height: 42px;
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: background 180ms ease, transform 180ms ease, border-color 180ms ease;
    }

    .nf__btn--primary {
      background: var(--ink);
      border: 1px solid var(--ink);
      color: var(--bg);

      &:hover { transform: translateY(-1px); }

      svg { transition: transform 220ms ease; }
      &:hover svg { transform: translateX(-2px); }
    }

    .nf__btn--ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--ink);

      &:hover {
        border-color: var(--border-strong);
        background: var(--surface);
      }
    }

    @keyframes nfFadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes nfCodeEnter {
      0%   { opacity: 0; transform: translateY(30px); letter-spacing: -0.08em; }
      100% { opacity: 1; transform: translateY(0); letter-spacing: -0.04em; }
    }

    @media (max-width: 600px) {
      .nf__strip {
        flex-wrap: wrap;
        gap: 16px;
      }
      .nf__actions {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `],
})
export class NotFoundComponent {
  private router = inject(Router);

  // Random flight id for flavor
  readonly flightId = this.generateFlightId();
  readonly origin = this.getOrigin();

  goHome(): void {
    this.router.navigate(['/home']);
  }

  private generateFlightId(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l = letters.charAt(Math.floor(Math.random() * letters.length))
          + letters.charAt(Math.floor(Math.random() * letters.length));
    const n = Math.floor(Math.random() * 9000) + 1000;
    return `${l}${n}`;
  }

  private getOrigin(): string {
    try {
      const path = window.location.pathname.replace(/^\//, '').split('/')[0] || 'LOST';
      return path.toUpperCase().slice(0, 12);
    } catch {
      return 'LOST';
    }
  }
}
