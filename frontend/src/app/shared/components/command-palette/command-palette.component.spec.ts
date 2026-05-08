import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CommandPaletteComponent } from './command-palette.component';
import { FilterStore } from '../../../core/store/filter.store';
import { NavigationStore } from '../../../core/store/navigation.store';
import { ThemeService } from '../../../core/theme/theme.service';
import { AuthService } from '../../../core/auth/auth.service';

const routerStub = {
  url: '/dashboard',
  navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)),
};

const filterStub = {
  clearSecondary: jasmine.createSpy('clearSecondary'),
  setDateRange:   jasmine.createSpy('setDateRange'),
};

const navStub = { requestTab: jasmine.createSpy('requestTab') };
const themeStub = { toggle: jasmine.createSpy('toggle') };
const authStub  = { logout: jasmine.createSpy('logout') };

describe('CommandPaletteComponent', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule],
      declarations: [CommandPaletteComponent],
      providers: [
        { provide: Router,          useValue: routerStub },
        { provide: FilterStore,     useValue: filterStub },
        { provide: NavigationStore, useValue: navStub },
        { provide: ThemeService,    useValue: themeStub },
        { provide: AuthService,     useValue: authStub },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
  });

  it('isOpen starts false', () => {
    expect(component.isOpen).toBe(false);
  });

  it('show() flips isOpen to true and resets the query', () => {
    component.query = 'leftover';
    component.show();
    expect(component.isOpen).toBe(true);
    expect(component.query).toBe('');
  });

  it('close() flips isOpen back to false', () => {
    component.show();
    component.close();
    expect(component.isOpen).toBe(false);
  });

  it('toggle() flips state', () => {
    expect(component.isOpen).toBe(false);
    component.toggle();
    expect(component.isOpen).toBe(true);
    component.toggle();
    expect(component.isOpen).toBe(false);
  });

  it('filtered returns all commands when query is empty', () => {
    component.query = '';
    // Sanity: there should be at least the seven Navigation entries +
    // five Filter entries + theme + signout. Don't pin an exact number
    // — the catalogue may grow.
    expect(component.filtered.length).toBeGreaterThan(10);
  });

  it('filtered narrows by single-term query', () => {
    component.query = 'theme';
    const ids = component.filtered.map(c => c.id);
    expect(ids).toContain('theme.toggle');
    expect(ids).not.toContain('nav.home');
  });

  it('filtered narrows by multi-term query (terms AND-ed)', () => {
    component.query = 'set date';
    const ids = component.filtered.map(c => c.id);
    // All four `filter.*` date presets match "set date"
    expect(ids).toContain('filter.today');
    expect(ids).toContain('filter.mtd');
    // Theme/signout don't
    expect(ids).not.toContain('theme.toggle');
  });

  it('filtered ranks exact label matches first', () => {
    component.query = 'sign out';
    expect(component.filtered[0].id).toBe('account.signout');
  });

  it('grouped preserves section insertion order', () => {
    component.query = '';
    const sections = component.grouped.map(g => g.section);
    // Whatever the catalog declares, Navigation should appear before
    // Filters, which should appear before Theme + Account.
    expect(sections.indexOf('Navigation')).toBeLessThan(sections.indexOf('Filters'));
    expect(sections.indexOf('Filters')).toBeLessThan(sections.indexOf('Theme'));
  });

  it('Ctrl+K keydown calls toggle()', () => {
    const spy = spyOn(component, 'toggle');
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    component.onGlobalKeydown(e);
    expect(spy).toHaveBeenCalled();
  });

  it('Cmd+K (metaKey) keydown also toggles', () => {
    const spy = spyOn(component, 'toggle');
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    component.onGlobalKeydown(e);
    expect(spy).toHaveBeenCalled();
  });

  it('Escape closes when open', () => {
    component.show();
    const spy = spyOn(component, 'close');
    component.onGlobalKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(spy).toHaveBeenCalled();
  });

  it('selectById updates selectedId', () => {
    component.selectById('nav.home');
    expect(component.selectedId).toBe('nav.home');
  });
});
