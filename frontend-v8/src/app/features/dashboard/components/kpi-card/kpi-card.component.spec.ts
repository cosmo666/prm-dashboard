import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { KpiCardComponent } from './kpi-card.component';

describe('KpiCardComponent', () => {
  let fixture: ComponentFixture<KpiCardComponent>;
  let component: KpiCardComponent;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [KpiCardComponent],
      // [pTooltip] is the migration target for the deleted [appTooltip]
      // directive. The card template references the attribute; this
      // spec doesn't exercise tooltip behaviour. NO_ERRORS_SCHEMA
      // (not CUSTOM_ELEMENTS_SCHEMA) is required because pTooltip is
      // an unknown ATTRIBUTE/directive, not an unknown element —
      // CUSTOM_ELEMENTS_SCHEMA only swallows unknown elements.
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(KpiCardComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
  });

  it('renders label and value', () => {
    component.label = 'Total PRM Services';
    component.value = '12,345';
    fixture.detectChanges();

    const label = el.querySelector('.kpi-card__label') as HTMLElement;
    const value = el.querySelector('.kpi-card__value') as HTMLElement;
    expect(label).not.toBeNull();
    expect(value).not.toBeNull();
    expect((label.textContent || '').trim()).toBe('Total PRM Services');
    expect((value.textContent || '').trim()).toBe('12,345');
  });

  it('shows skeleton when loading=true', () => {
    component.loading = true;
    component.label = 'Loading metric';
    component.value = 'should-not-render';
    fixture.detectChanges();

    expect(el.querySelector('.kpi-skeleton-value')).not.toBeNull();
    expect(el.querySelector('.kpi-card__value')).toBeNull();
  });

  it('hides delta block when delta is null', () => {
    component.label = 'Foo';
    component.value = '0';
    component.delta = null;
    fixture.detectChanges();

    expect(el.querySelector('.kpi-card__delta')).toBeNull();
  });

  it('uses is-up class when delta >= 0.1', () => {
    component.label = 'Foo';
    component.value = '0';
    component.delta = 0.1;
    fixture.detectChanges();

    const delta = el.querySelector('.kpi-card__delta') as HTMLElement;
    expect(delta).not.toBeNull();
    expect(delta.classList.contains('is-up')).toBe(true);
  });

  it('uses is-down class when delta <= -0.1', () => {
    component.label = 'Foo';
    component.value = '0';
    component.delta = -5.4;
    fixture.detectChanges();

    const delta = el.querySelector('.kpi-card__delta') as HTMLElement;
    expect(delta).not.toBeNull();
    expect(delta.classList.contains('is-down')).toBe(true);
  });

  it('uses is-flat class when -0.1 < delta < 0.1', () => {
    component.label = 'Foo';
    component.value = '0';
    component.delta = 0.05;
    fixture.detectChanges();

    const delta = el.querySelector('.kpi-card__delta') as HTMLElement;
    expect(delta).not.toBeNull();
    expect(delta.classList.contains('is-flat')).toBe(true);
  });

  it('renders subtext when provided', () => {
    component.label = 'Foo';
    component.value = '0';
    component.subtext = '8 self / 4 outsourced';
    fixture.detectChanges();

    const subtext = el.querySelector('.kpi-card__subtext') as HTMLElement;
    expect(subtext).not.toBeNull();
    expect((subtext.textContent || '').trim()).toBe('8 self / 4 outsourced');
  });
});
