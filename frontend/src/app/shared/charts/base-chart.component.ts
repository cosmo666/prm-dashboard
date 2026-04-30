import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import { EChartsOption, ECElementEvent } from 'echarts';

@Component({
  selector: 'app-base-chart',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  template: `
    <section
      class="chart"
      role="img"
      [attr.aria-label]="ariaDescription()"
      [attr.aria-busy]="loading() ? 'true' : null">
      @if (title()) {
        <header class="chart__head">
          <span class="chart__title">{{ title() }}</span>
          @if (subtitle()) {
            <span class="chart__sub">{{ subtitle() }}</span>
          }
        </header>
      }

      <div class="chart__body" aria-live="polite">
        @if (loading()) {
          <div class="chart__skeleton" role="status" aria-label="Loading chart data">
            <div class="shimmer shimmer--bar" style="height: 22%"></div>
            <div class="shimmer shimmer--bar" style="height: 45%"></div>
            <div class="shimmer shimmer--bar" style="height: 32%"></div>
            <div class="shimmer shimmer--bar" style="height: 58%"></div>
            <div class="shimmer shimmer--bar" style="height: 38%"></div>
            <div class="shimmer shimmer--bar" style="height: 64%"></div>
            <div class="shimmer shimmer--bar" style="height: 28%"></div>
            <div class="shimmer shimmer--bar" style="height: 48%"></div>
          </div>
        } @else if (isEmpty()) {
          <div class="chart__empty" role="status">
            <div class="chart__empty-mark" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" stroke="currentColor" stroke-width="0.75" stroke-dasharray="2 3" opacity="0.5"/>
                <path d="M9 14h10M14 9v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
              </svg>
            </div>
            <div class="chart__empty-title">No data</div>
            <div class="chart__empty-hint">Try expanding the date range or clearing filters.</div>
          </div>
        } @else {
          <div
            echarts
            [options]="options()"
            [autoResize]="true"
            (chartClick)="chartClick.emit($event)"
            class="chart__canvas"
            role="presentation"></div>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .chart {
      height: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 14px 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }

    .chart:hover {
      border-color: var(--border-strong);
      box-shadow: var(--shadow-1);
    }

    .chart__head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }

    .chart__title {
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: var(--ink);
    }

    .chart__sub {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted-2);
    }

    .chart__body {
      flex: 1;
      position: relative;
      min-height: 180px;
    }

    .chart__canvas {
      width: 100%;
      height: 100%;
      min-height: 180px;
    }

    // Skeleton loading — bar-shaped shimmer
    .chart__skeleton {
      position: absolute;
      inset: 12px 8px 8px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
    }

    .shimmer--bar {
      flex: 1;
      min-height: 20px;
      background: linear-gradient(
        90deg,
        var(--surface-2) 0%,
        var(--border) 50%,
        var(--surface-2) 100%
      );
      background-size: 400px 100%;
      border-radius: 2px 2px 0 0;
      animation: chartShimmer 1.8s ease-in-out infinite;
    }

    .shimmer--bar:nth-child(1) { animation-delay: 0ms; }
    .shimmer--bar:nth-child(2) { animation-delay: 80ms; }
    .shimmer--bar:nth-child(3) { animation-delay: 160ms; }
    .shimmer--bar:nth-child(4) { animation-delay: 240ms; }
    .shimmer--bar:nth-child(5) { animation-delay: 320ms; }
    .shimmer--bar:nth-child(6) { animation-delay: 400ms; }
    .shimmer--bar:nth-child(7) { animation-delay: 480ms; }
    .shimmer--bar:nth-child(8) { animation-delay: 560ms; }

    @keyframes chartShimmer {
      0%   { background-position: -200px 0; }
      100% { background-position: 200px 0; }
    }

    // Empty state — editorial
    .chart__empty {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: var(--muted);
      padding: 20px;
      text-align: center;
    }

    .chart__empty-mark {
      color: var(--border-strong);
      margin-bottom: 8px;
    }

    .chart__empty-title {
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      color: var(--ink-muted);
      letter-spacing: -0.01em;
    }

    .chart__empty-hint {
      font-family: var(--font-sans);
      font-size: 11px;
      color: var(--muted);
      max-width: 220px;
      line-height: 1.5;
      margin-top: 2px;
    }
  `],
})
export class BaseChartComponent {
  title = input<string>('');
  subtitle = input<string>('');
  options = input.required<EChartsOption>();
  loading = input<boolean>(false);
  isEmpty = input<boolean>(false);
  chartClick = output<ECElementEvent>();

  // Screen-reader description — falls back to title/subtitle if no explicit
  // description is provided by the caller.
  ariaDescription = computed<string>(() => {
    const parts: string[] = [];
    if (this.title()) parts.push(this.title());
    if (this.subtitle()) parts.push(this.subtitle());
    if (this.loading()) parts.push('loading');
    else if (this.isEmpty()) parts.push('no data available');
    else parts.push('chart');
    return parts.join(', ');
  });
}
