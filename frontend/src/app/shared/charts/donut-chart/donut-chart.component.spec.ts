import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DonutChartComponent } from './donut-chart.component';

describe('DonutChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DonutChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds options when data is non-empty', () => {
    const fixture = TestBed.createComponent(DonutChartComponent);
    fixture.componentInstance.data = [
      { name: 'WCHR', value: 60 },
      { name: 'WCHC', value: 40 },
    ];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeTruthy();
    const series = ((fixture.componentInstance.options as any).series as any[])[0];
    expect(series.type).toBe('pie');
    expect(series.data.length).toBe(2);
    expect(series.data[0].name).toBe('WCHR');
  });

  it('still produces an options object when data is empty (BaseChart renders the empty state)', () => {
    const fixture = TestBed.createComponent(DonutChartComponent);
    fixture.componentInstance.data = [];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).not.toBeNull();
    const series = ((fixture.componentInstance.options as any).series as any[])[0];
    expect(series.data).toEqual([]);
  });

  it('emits segmentClick on onChartClick with valid event', () => {
    const fixture = TestBed.createComponent(DonutChartComponent);
    let received: { name: string; value: number } | null = null;
    fixture.componentInstance.segmentClick.subscribe((v: { name: string; value: number }) => received = v);

    fixture.componentInstance.onChartClick({ data: { name: 'WCHR', value: 60 } });

    const r = received as { name: string; value: number } | null;
    expect(r).not.toBeNull();
    if (r) {
      expect(r.name).toBe('WCHR');
      expect(r.value).toBe(60);
    }
  });
});
