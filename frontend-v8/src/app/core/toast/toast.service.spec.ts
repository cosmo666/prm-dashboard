import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    // Angular 8: TestBed.get is the supported API. TestBed.inject was
    // added in 9.0 — using it here would be a compile error against
    // the version-pinned @angular/core in this workspace.
    service = TestBed.get(ToastService);
    jasmine.clock().install();
  });

  afterEach(() => { jasmine.clock().uninstall(); });

  it('show() adds a toast to the list', () => {
    service.show('Hello');
    expect(service.toastsSnapshot.length).toBe(1);
    expect(service.toastsSnapshot[0].text).toBe('Hello');
  });

  it('dismiss() removes the toast by id', () => {
    service.show('A');
    const id = service.toastsSnapshot[0].id;
    service.dismiss(id);
    expect(service.toastsSnapshot.length).toBe(0);
  });

  it('auto-dismisses after 2500ms', () => {
    service.show('Auto');
    expect(service.toastsSnapshot.length).toBe(1);
    jasmine.clock().tick(2501);
    expect(service.toastsSnapshot.length).toBe(0);
  });

  it('preserves order and assigns unique ids across multiple show() calls', () => {
    service.show('first');
    service.show('second');
    service.show('third');
    const list = service.toastsSnapshot;
    expect(list.length).toBe(3);
    expect(list.map(t => t.text)).toEqual(['first', 'second', 'third']);
    expect(new Set(list.map(t => t.id)).size).toBe(3);
  });
});
