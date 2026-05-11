import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';

import { DevTenantPickerComponent, readDevTenantOverride, DEV_TENANT_STORAGE_KEY } from './dev-tenant-picker.component';
import { ApiClient } from '../../../core/api/api.client';
import { AuthStore } from '../../../core/store/auth.store';

describe('DevTenantPickerComponent', () => {
  let fixture: ComponentFixture<DevTenantPickerComponent>;
  let component: DevTenantPickerComponent;

  let apiPostSpy: jasmine.Spy;
  let authClearSpy: jasmine.Spy;

  beforeEach(() => {
    localStorage.clear();
    apiPostSpy   = jasmine.createSpy('post').and.returnValue(of({}));
    authClearSpy = jasmine.createSpy('clear');

    TestBed.configureTestingModule({
      declarations: [DevTenantPickerComponent],
      providers: [
        { provide: ApiClient,  useValue: { post: apiPostSpy } },
        { provide: AuthStore,  useValue: { clear: authClearSpy } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(DevTenantPickerComponent);
    component = fixture.componentInstance;
    // Stub the navigation indirection so the karma runner doesn't actually
    // try to follow window.location.assign('/login') mid-test.
    spyOn(component as any, 'doNavigate');
  });

  afterEach(() => { localStorage.clear(); });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('toggleMenu flips isMenuOpen', () => {
    expect(component.isMenuOpen).toBe(false);
    component.toggleMenu();
    expect(component.isMenuOpen).toBe(true);
    component.toggleMenu();
    expect(component.isMenuOpen).toBe(false);
  });

  it('closeMenu sets isMenuOpen to false', () => {
    component.isMenuOpen = true;
    component.closeMenu();
    expect(component.isMenuOpen).toBe(false);
  });

  it('activeSlug defaults to "aeroground" when localStorage is empty', () => {
    // Note: visible is determined by hostname at module-load time. In karma
    // (likely "localhost" or "127.0.0.1") visible is true; activeSlug should
    // therefore consult localStorage. Empty storage → fallback to first tenant.
    expect(component.activeSlug).toBe('aeroground');
  });

  it('switchTo(activeSlug) is a no-op for the API and just closes the menu', () => {
    component.isMenuOpen = true;
    component.switchTo(component.activeSlug);
    expect(apiPostSpy).not.toHaveBeenCalled();
    expect(authClearSpy).not.toHaveBeenCalled();
    expect(component.isMenuOpen).toBe(false);
  });

  it('switchTo(other) writes to localStorage and triggers logout flow', () => {
    component.switchTo('skyserve');
    expect(localStorage.getItem(DEV_TENANT_STORAGE_KEY)).toBe('skyserve');
    expect(apiPostSpy).toHaveBeenCalledWith('/auth/logout', {});
    expect(authClearSpy).toHaveBeenCalled();
    expect((component as any).doNavigate).toHaveBeenCalledWith('/login');
  });

  it('readDevTenantOverride returns null when storage is empty', () => {
    localStorage.removeItem(DEV_TENANT_STORAGE_KEY);
    expect(readDevTenantOverride()).toBeNull();
  });

  it('readDevTenantOverride returns null for an unknown slug', () => {
    localStorage.setItem(DEV_TENANT_STORAGE_KEY, 'not-a-tenant');
    expect(readDevTenantOverride()).toBeNull();
  });

  it('readDevTenantOverride round-trips a known slug', () => {
    localStorage.setItem(DEV_TENANT_STORAGE_KEY, 'globalprm');
    expect(readDevTenantOverride()).toBe('globalprm');
  });
});
