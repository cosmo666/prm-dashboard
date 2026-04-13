import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BarChartComponent, BarDatum } from '../bar-chart/bar-chart.component';

@Component({
  selector: 'app-horizontal-bar-chart',
  standalone: true,
  imports: [CommonModule, BarChartComponent],
  template: `
    <app-bar-chart [title]="title()" [subtitle]="subtitle()" [data]="data()" [loading]="loading()" [horizontal]="true"
                   [xLabel]="xLabel()" [yLabel]="yLabel()" [unit]="unit()"
                   (barClick)="barClick.emit($event)"></app-bar-chart>
  `,
})
export class HorizontalBarChartComponent {
  title    = input<string>('');
  subtitle = input<string>('');
  data     = input.required<BarDatum[]>();
  loading  = input<boolean>(false);
  xLabel   = input<string>('Count');
  yLabel   = input<string>('');
  unit     = input<string>('');
  barClick = output<string>();
}
