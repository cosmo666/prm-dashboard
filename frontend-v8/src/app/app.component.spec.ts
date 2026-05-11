import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      // The AppComponent template mounts shell singletons (toast,
      // progress bar) by selector. We don't want to wire those up
      // here — this spec only checks that AppComponent itself
      // constructs and renders router-outlet.
      // CUSTOM_ELEMENTS_SCHEMA lets the test ignore unknown shell
      // tags without flagging them as template errors.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    });
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
