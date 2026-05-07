import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { LineChartComponent } from './line-chart.component';

describe('LineChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [LineChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds options with series.data matching trend.values', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01', '2026-04-02'], values: [10, 12], average: 11 };
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeTruthy();
    expect(((fixture.componentInstance.options as any).series as any[])[0].data).toEqual([10, 12]);
  });

  it('options is null when trend is null', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = null;
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeNull();
  });

  it('renders a single series when secondarySeries is null', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01'], values: [10], average: 10 };
    fixture.componentInstance.secondarySeries = null;
    fixture.componentInstance.ngOnChanges();
    expect(((fixture.componentInstance.options as any).series as any[]).length).toBe(1);
  });

  it('renders a dotted prev-period series when secondarySeries has values (OQ-P1-3)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01', '2026-04-02'], values: [10, 12], average: 11 };
    fixture.componentInstance.secondarySeries = { dates: ['2026-03-01', '2026-03-02'], values: [8, 9], average: 8.5 };
    fixture.componentInstance.ngOnChanges();
    const series = (fixture.componentInstance.options as any).series as any[];
    expect(series.length).toBe(2);
    expect(series[1].name).toBe('Prev period');
    expect(series[1].lineStyle.type).toBe('dotted');
    expect(series[1].lineStyle.opacity).toBeCloseTo(0.35);
  });

  it('renders an "area" type series with areaStyle filled', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.series = [{
      name: 'Actual',
      type: 'area',
      data: [['Mon', 10], ['Tue', 20]],
      color: '#1e88e5',
    }];
    fixture.componentInstance.ngOnChanges();
    const series = ((fixture.componentInstance.options as any).series as any[])[0];
    expect(series.type).toBe('line');
    expect(series.areaStyle).toBeTruthy();
  });

  it('dualAxis splits bars to yAxis 0 and lines to yAxis 1 (Fulfillment use)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.series = [
      { name: 'Provided',  type: 'bar',  data: [['Mon', 10]] },
      { name: 'Requested', type: 'line', data: [['Mon', 12]] },
    ];
    fixture.componentInstance.dualAxis = true;
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(Array.isArray(opts.yAxis)).toBe(true);
    expect(opts.yAxis.length).toBe(2);
    const series = opts.series as any[];
    expect(series[0].type).toBe('bar');
    expect(series[0].yAxisIndex).toBe(0);
    expect(series[1].type).toBe('line');
    expect(series[1].yAxisIndex).toBe(1);
  });

  it('non-dualAxis renders a single yAxis object (back-compat)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.series = [{ name: 'A', data: [['x', 1]] }];
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(Array.isArray(opts.yAxis)).toBe(false);
    expect(opts.series[0].yAxisIndex).toBeUndefined();
  });

  it('emits pointClick with the date when onChartClick fires (OQ-P1-2 contract)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    let captured: string | null = null;
    fixture.componentInstance.pointClick.subscribe((d: string) => { captured = d; });
    fixture.componentInstance.onChartClick({ name: '2026-04-01', value: 10 });
    expect(captured as string | null).toBe('2026-04-01');
  });

  it('does not emit pointClick when event payload lacks a name', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    const spy = jasmine.createSpy('pointClick');
    fixture.componentInstance.pointClick.subscribe(spy);
    fixture.componentInstance.onChartClick({});
    fixture.componentInstance.onChartClick(null as any);
    expect(spy).not.toHaveBeenCalled();
  });
});
