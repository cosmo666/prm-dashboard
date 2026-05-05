import { TestBed } from '@angular/core/testing';
import { ThemeService, ThemeMode } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let linkEl: HTMLLinkElement;

  beforeEach(() => {
    linkEl = document.createElement('link');
    linkEl.id = 'app-theme';
    linkEl.href = 'assets/themes/nova-light/theme.css';
    document.head.appendChild(linkEl);
    document.body.setAttribute('data-theme', 'light');
    localStorage.removeItem('app.theme');

    TestBed.configureTestingModule({});
    service = TestBed.get(ThemeService);
  });

  afterEach(() => {
    document.head.removeChild(linkEl);
    localStorage.removeItem('app.theme');
  });

  it('reads stored mode on init (defaults to light when none stored)', () => {
    expect(service.modeSnapshot).toBe('light');
  });

  it('setTheme("dark") swaps the stylesheet href and data-theme attribute', () => {
    service.setTheme('dark');
    expect(linkEl.href).toContain('nova-dark/theme.css');
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(service.modeSnapshot).toBe('dark');
    expect(localStorage.getItem('app.theme')).toBe('dark');
  });

  it('setTheme("light") swaps back', () => {
    service.setTheme('dark');
    service.setTheme('light');
    expect(linkEl.href).toContain('nova-light/theme.css');
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(service.modeSnapshot).toBe('light');
  });

  it('toggle flips mode', () => {
    expect(service.modeSnapshot).toBe('light');
    service.toggle();
    expect(service.modeSnapshot).toBe('dark');
    service.toggle();
    expect(service.modeSnapshot).toBe('light');
  });
});
