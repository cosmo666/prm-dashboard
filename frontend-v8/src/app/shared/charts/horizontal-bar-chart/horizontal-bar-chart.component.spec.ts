import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HorizontalBarChartComponent } from './horizontal-bar-chart.component';

describe('HorizontalBarChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HorizontalBarChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds yAxis.data and series.data from input', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentInstance.data = [
      { label: 'IndiGo', value: 120 },
      { label: 'Air India', value: 80 },
    ];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeTruthy();
    expect(((fixture.componentInstance.options as any).yAxis as any).data).toEqual(['IndiGo', 'Air India']);
    expect(((fixture.componentInstance.options as any).series as any[])[0].data).toEqual([120, 80]);
  });

  it('clamps to top 10 even if more rows are passed (defense-in-depth)', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    const rows = [];
    for (let i = 0; i < 15; i++) { rows.push({ label: 'X' + i, value: i }); }
    fixture.componentInstance.data = rows;
    fixture.componentInstance.ngOnChanges();
    expect((((fixture.componentInstance.options as any).yAxis as any).data as string[]).length).toBe(10);
  });

  it('emits barClick on onChartClick with category + value', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentInstance.data = [
      { label: 'IndiGo', value: 120 },
      { label: 'Air India', value: 80 },
    ];
    fixture.componentInstance.ngOnChanges();

    let received: { category: string; value: number } | null = null;
    fixture.componentInstance.barClick.subscribe((v: { category: string; value: number }) => received = v);

    fixture.componentInstance.onChartClick({ name: 'IndiGo', value: 120 });

    const r = received as { category: string; value: number } | null;
    expect(r).not.toBeNull();
    if (r) {
      expect(r.category).toBe('IndiGo');
      expect(r.value).toBe(120);
    }
  });

  it('renders single series when secondaryData is undefined (Phase 1 default)', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentInstance.data = [{ label: 'AI', value: 100 }];
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(opts.series.length).toBe(1);
    expect(opts.legend).toBeUndefined();
  });

  it('renders two stacked series when secondaryData is provided (OQ-P2-1)', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentInstance.data          = [{ label: 'AI102', value: 80 }, { label: 'UK990', value: 60 }];
    fixture.componentInstance.secondaryData = [{ label: 'AI102', value: 20 }, { label: 'UK990', value: 40 }];
    fixture.componentInstance.primaryLabel   = 'Serviced';
    fixture.componentInstance.secondaryLabel = 'Requested (gap)';
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(opts.series.length).toBe(2);
    expect(opts.series[0].stack).toBe('rank');
    expect(opts.series[1].stack).toBe('rank');
    expect(opts.series[1].itemStyle.opacity).toBeCloseTo(0.30);
    expect(opts.legend.data).toEqual(['Serviced', 'Requested (gap)']);
  });
});
