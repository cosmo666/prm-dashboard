import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        // AppComponent's child components (CommandPalette, etc.) need HttpClient and Router.
        // We provide testing doubles so the component tree can be instantiated.
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      // Suppress template errors from child components whose full dependency
      // trees are not wired here — this spec only validates root creation.
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
