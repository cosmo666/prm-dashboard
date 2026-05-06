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
    expect((fixture.componentInstance.options!.series as any[])[0].data).toEqual([10, 12]);
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
    expect((fixture.componentInstance.options!.series as any[]).length).toBe(1);
  });

  it('renders a dotted prev-period series when secondarySeries has values (OQ-P1-3)', () => {
    const fixture = TestBed.createComponent(LineChartComponent);
    fixture.componentInstance.trend = { dates: ['2026-04-01', '2026-04-02'], values: [10, 12], average: 11 };
    fixture.componentInstance.secondarySeries = { dates: ['2026-03-01', '2026-03-02'], values: [8, 9], average: 8.5 };
    fixture.componentInstance.ngOnChanges();
    const series = fixture.componentInstance.options!.series as any[];
    expect(series.length).toBe(2);
    expect(series[1].name).toBe('Prev period');
    expect(series[1].lineStyle.type).toBe('dotted');
    expect(series[1].lineStyle.opacity).toBeCloseTo(0.35);
  });
});
