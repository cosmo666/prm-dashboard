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
    expect((fixture.componentInstance.options!.yAxis as any).data).toEqual(['IndiGo', 'Air India']);
    expect((fixture.componentInstance.options!.series as any[])[0].data).toEqual([120, 80]);
  });

  it('clamps to top 10 even if more rows are passed (defense-in-depth)', () => {
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    const rows = [];
    for (let i = 0; i < 15; i++) { rows.push({ label: 'X' + i, value: i }); }
    fixture.componentInstance.data = rows;
    fixture.componentInstance.ngOnChanges();
    expect(((fixture.componentInstance.options!.yAxis as any).data as string[]).length).toBe(10);
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

    expect(received).not.toBeNull();
    expect(received!.category).toBe('IndiGo');
    expect(received!.value).toBe(120);
  });
});
