import { TestBed } from '@angular/core/testing';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.get(ProgressService);
  });

  it('activeSnapshot is false initially', () => {
    expect(service.activeSnapshot).toBe(false);
  });

  it('start() flips activeSnapshot to true', () => {
    service.start();
    expect(service.activeSnapshot).toBe(true);
  });

  it('start() then stop() returns to false', () => {
    service.start();
    service.stop();
    expect(service.activeSnapshot).toBe(false);
  });

  it('two start()s require two stop()s before activeSnapshot flips off', () => {
    service.start();
    service.start();
    service.stop();
    expect(service.activeSnapshot).toBe(true);
    service.stop();
    expect(service.activeSnapshot).toBe(false);
  });

  it('stop() without a matching start() clamps at 0 and stays inactive', () => {
    service.stop();
    expect(service.activeSnapshot).toBe(false);
    // The next real start/stop pair must still flip cleanly.
    service.start();
    expect(service.activeSnapshot).toBe(true);
    service.stop();
    expect(service.activeSnapshot).toBe(false);
  });
});
