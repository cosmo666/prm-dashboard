import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';

describe('BarChartComponent', () => {
  let component: BarChartComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [BarChartComponent] });
    component = new BarChartComponent();
  });

  it('builds an empty options object when data is empty', () => {
    component.data = [];
    component.ngOnChanges();
    const series = (component.options as any).series;
    expect(series[0].data).toEqual([]);
  });

  it('builds series.data from input', () => {
    component.data = [
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
    ];
    component.ngOnChanges();
    expect((component.options as any).xAxis.data).toEqual(['A', 'B']);
    expect((component.options as any).series[0].data).toEqual([10, 20]);
  });
});
