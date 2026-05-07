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
    const opts = component.options as any;
    expect(opts.xAxis.data).toEqual(['A', 'B']);
    // Single-series mode emits objects (per-bar shape) so per-bar color overrides work.
    expect(opts.series[0].data.length).toBe(2);
    expect(opts.series[0].data[0].value).toBe(10);
    expect(opts.series[0].data[1].value).toBe(20);
  });

  it('renders single series when stackedSeries is undefined (Phase 0 default)', () => {
    component.data = [{ label: 'A', value: 10 }, { label: 'B', value: 20 }];
    component.ngOnChanges();
    const opts = component.options as any;
    expect(opts.series.length).toBe(1);
    expect(opts.legend).toBeUndefined();
  });

  it('renders stacked series when stackedSeries is provided (OQ-P3-4)', () => {
    component.data = [{ label: '2026-02', value: 0 }, { label: '2026-03', value: 0 }];
    component.stackedSeries = {
      WCHR: [40, 60],
      WCHC: [10, 15],
    };
    component.stackKeys = ['WCHR', 'WCHC'];
    component.stackColors = { WCHR: '#2563EB', WCHC: '#1e3a8a' };
    component.ngOnChanges();
    const opts = component.options as any;
    expect(opts.series.length).toBe(2);
    expect(opts.series[0].stack).toBe('mix');
    expect(opts.series[1].stack).toBe('mix');
    expect(opts.series[0].itemStyle.color).toBe('#2563EB');
    expect(opts.legend.data).toEqual(['WCHR', 'WCHC']);
  });

  it('honors BarDatum.color when provided (per-bar override)', () => {
    component.data = [
      { label: 'Mon', value: 50, color: '#1e88e5' },
      { label: 'Sat', value: 30, color: '#fb8c00' },
    ];
    component.ngOnChanges();
    const opts = component.options as any;
    expect(opts.series[0].data[0].itemStyle.color).toBe('#1e88e5');
    expect(opts.series[0].data[1].itemStyle.color).toBe('#fb8c00');
  });

  it('emits barClick with category + value when onChartClick fires', () => {
    component.data = [{ label: 'A', value: 10 }, { label: 'B', value: 20 }];
    component.ngOnChanges();
    // tslint:disable-next-line: no-any
    let captured: any = null;
    component.barClick.subscribe((v: { category: string; value: number }) => { captured = v; });
    component.onChartClick({ name: 'A', value: 10 });
    expect(captured).toEqual({ category: 'A', value: 10 });
  });
});
