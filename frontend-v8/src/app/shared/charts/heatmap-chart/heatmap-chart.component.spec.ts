import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { HeatmapChartComponent } from './heatmap-chart.component';

describe('HeatmapChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HeatmapChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds heatmap series.data as [xIndex, yIndex, value] triples', () => {
    const fixture = TestBed.createComponent(HeatmapChartComponent);
    fixture.componentInstance.xLabels = ['08:00', '09:00'];
    fixture.componentInstance.yLabels = ['Mon', 'Tue'];
    fixture.componentInstance.cells = [
      { x: '08:00', y: 'Mon', value: 5 },
      { x: '09:00', y: 'Tue', value: 12 },
    ];
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(opts.series[0].type).toBe('heatmap');
    expect(opts.series[0].data).toEqual([[0, 0, 5], [1, 1, 12]]);
  });

  it('drops cells whose labels are missing from the axes', () => {
    const fixture = TestBed.createComponent(HeatmapChartComponent);
    fixture.componentInstance.xLabels = ['A'];
    fixture.componentInstance.yLabels = ['Y'];
    fixture.componentInstance.cells = [
      { x: 'A', y: 'Y', value: 1 },
      { x: 'B', y: 'Y', value: 99 },
    ];
    fixture.componentInstance.ngOnChanges();
    expect(((fixture.componentInstance.options as any).series[0].data as any[]).length).toBe(1);
  });

  it('visualMap.max never falls below 1 (echarts collapses on min === max)', () => {
    const fixture = TestBed.createComponent(HeatmapChartComponent);
    fixture.componentInstance.xLabels = ['A'];
    fixture.componentInstance.yLabels = ['Y'];
    fixture.componentInstance.cells = [{ x: 'A', y: 'Y', value: 0 }];
    fixture.componentInstance.ngOnChanges();
    const vm = (fixture.componentInstance.options as any).visualMap;
    expect(vm.max).toBe(1);
  });

  it('emits cellClick with resolved x/y/value on chartClick', () => {
    const fixture = TestBed.createComponent(HeatmapChartComponent);
    fixture.componentInstance.xLabels = ['08:00'];
    fixture.componentInstance.yLabels = ['Mon'];
    fixture.componentInstance.cells = [{ x: '08:00', y: 'Mon', value: 7 }];
    fixture.componentInstance.ngOnChanges();
    let captured: { x: string; y: string; value: number } | null = null;
    fixture.componentInstance.cellClick.subscribe((c: { x: string; y: string; value: number }) => { captured = c; });
    fixture.componentInstance.onChartClick({ data: [0, 0, 7] });
    expect(captured as { x: string; y: string; value: number } | null).toEqual({ x: '08:00', y: 'Mon', value: 7 });
  });

  it('renders without throwing when cells / labels are empty', () => {
    const fixture = TestBed.createComponent(HeatmapChartComponent);
    fixture.componentInstance.cells = [];
    fixture.componentInstance.xLabels = [];
    fixture.componentInstance.yLabels = [];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).not.toBeNull();
  });
});
