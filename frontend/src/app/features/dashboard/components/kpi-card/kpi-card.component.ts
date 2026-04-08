import { Component, input, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="kpi-card" [class]="gradientClass()">
      <div class="kpi-header">
        <mat-icon>{{ icon() }}</mat-icon>
        <span class="kpi-label">{{ label() }}</span>
      </div>
      <div class="kpi-value">{{ value() }}</div>
      <div class="kpi-delta" *ngIf="delta() !== null" [class.positive]="(delta() ?? 0) >= 0">
        <mat-icon>{{ (delta() ?? 0) >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
        {{ (delta() ?? 0) | number:'1.1-1' }}%
        <span class="delta-label">vs prev period</span>
      </div>
      <div class="kpi-subtext" *ngIf="subtext()">{{ subtext() }}</div>
    </div>
  `,
  styles: [`
    .kpi-card {
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      min-height: 140px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 200ms ease;
      &:hover { transform: translateY(-2px); }
    }
    .grad-blue   { background: linear-gradient(135deg, #1e88e5, #1565c0); }
    .grad-teal   { background: linear-gradient(135deg, #26a69a, #00796b); }
    .grad-orange { background: linear-gradient(135deg, #fb8c00, #ef6c00); }
    .grad-purple { background: linear-gradient(135deg, #7e57c2, #4527a0); }
    .grad-green  { background: linear-gradient(135deg, #66bb6a, #2e7d32); }
    .kpi-header  { display: flex; align-items: center; gap: 0.5rem; opacity: 0.9; font-size: 0.85rem; }
    .kpi-value   { font-size: 2rem; font-weight: 700; line-height: 1.1; }
    .kpi-delta   { font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; opacity: 0.95; }
    .kpi-delta mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .delta-label { opacity: 0.75; margin-left: 0.25rem; }
    .kpi-subtext { font-size: 0.75rem; opacity: 0.85; margin-top: 0.25rem; }
  `],
})
export class KpiCardComponent {
  label    = input.required<string>();
  value    = input.required<string | number>();
  icon     = input<string>('insights');
  delta    = input<number | null>(null);
  subtext  = input<string>('');
  gradient = input<'blue' | 'teal' | 'orange' | 'purple' | 'green'>('blue');
  gradientClass = computed(() => `grad-${this.gradient()}`);
}
