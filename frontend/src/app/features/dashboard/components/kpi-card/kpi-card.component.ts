import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
})
export class KpiCardComponent {
  @Input() label = '';
  @Input() value = '';
  @Input() delta: number | null = null;
  @Input() subtext: string | null = null;
  @Input() loading = false;
  @Input() icon: string | null = null;   // e.g. 'pi-chart-bar'

  get deltaClass(): string {
    if (this.delta === null || this.delta === undefined) { return ''; }
    if (this.delta >= 0.1)  { return 'is-up'; }
    if (this.delta <= -0.1) { return 'is-down'; }
    return 'is-flat';
  }

  get formattedDelta(): string {
    if (this.delta === null || this.delta === undefined) { return ''; }
    const sign = this.delta > 0 ? '+' : '';
    return sign + this.delta.toFixed(1) + '%';
  }
}
