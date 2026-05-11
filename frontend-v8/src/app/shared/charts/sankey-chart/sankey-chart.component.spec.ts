import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { SankeyChartComponent } from './sankey-chart.component';

describe('SankeyChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SankeyChartComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  it('builds sankey options when nodes and links are non-empty', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    fixture.componentInstance.nodes = [{ name: 'Self' }, { name: 'WCHR' }, { name: 'AI102' }];
    fixture.componentInstance.links = [
      { source: 'Self', target: 'WCHR', value: 10 },
      { source: 'WCHR', target: 'AI102', value: 5 },
    ];
    fixture.componentInstance.ngOnChanges();
    const opts = fixture.componentInstance.options as any;
    expect(opts).toBeTruthy();
    expect(opts.series[0].type).toBe('sankey');
    expect(opts.series[0].data.length).toBe(3);
    expect(opts.series[0].links.length).toBe(2);
  });

  it('options is null when nodes are empty', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    fixture.componentInstance.nodes = [];
    fixture.componentInstance.links = [{ source: 'A', target: 'B', value: 1 }];
    fixture.componentInstance.ngOnChanges();
    expect(fixture.componentInstance.options).toBeNull();
  });

  it('emits nodeClick on a node click event (OQ-P3-3)', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    let captured = '';
    fixture.componentInstance.nodeClick.subscribe((name: string) => { captured = name; });
    fixture.componentInstance.onChartClick({ dataType: 'node', name: 'WCHR' });
    expect(captured).toBe('WCHR');
  });

  it('does not emit nodeClick on a link/edge click', () => {
    const fixture = TestBed.createComponent(SankeyChartComponent);
    const spy = jasmine.createSpy('nodeClick');
    fixture.componentInstance.nodeClick.subscribe(spy);
    fixture.componentInstance.onChartClick({ dataType: 'edge', source: 'Self', target: 'WCHR' });
    expect(spy).not.toHaveBeenCalled();
  });
});
