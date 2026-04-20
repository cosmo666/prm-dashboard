import { Component, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { FilterStore } from '../../../core/store/filter.store';
import { SavedViewsStore, SavedView } from '../../../core/store/saved-views.store';

@Component({
  selector: 'app-saved-views-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, MatMenuModule],
  template: `
    <button
      #trigger
      class="views-btn"
      [matMenuTriggerFor]="menu"
      type="button"
      [attr.aria-label]="'Saved views (' + store.count() + ')'"
      (menuOpened)="onMenuOpened()">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <path d="M3.5 1.5h7a.5.5 0 0 1 .5.5v10.5l-4-2.5-4 2.5V2a.5.5 0 0 1 .5-.5z"
          stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
      <span class="views-btn__label">Views</span>
      @if (store.count() > 0) {
        <span class="views-btn__badge font-data">{{ store.count() }}</span>
      }
      <svg class="views-btn__caret" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <mat-menu #menu="matMenu" class="views-menu" xPosition="before">
      <div class="views-wrap" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
        <div class="views-head">
          <div class="label-micro">Saved views</div>
          @if (store.count() > 0) {
            <div class="views-head__count font-data">{{ store.count() }}</div>
          }
        </div>

        @if (store.count() === 0) {
          <div class="views-empty">
            <div class="views-empty__title">No saved views yet</div>
            <div class="views-empty__hint">Save the current filter combination below to restore it later.</div>
          </div>
        } @else {
          <div class="views-list">
            @for (v of store.views(); track v.id) {
              <div class="view-row" [class.active]="isActive(v)">
                <button
                  type="button"
                  class="view-row__main"
                  (click)="apply(v)">
                  <div class="view-row__name">{{ v.name }}</div>
                  <div class="view-row__meta font-data">{{ describe(v) }}</div>
                </button>
                <button
                  type="button"
                  class="view-row__del"
                  aria-label="Delete view"
                  (click)="remove(v.id, $event)">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            }
          </div>
        }

        <div class="views-save">
          <div class="label-micro views-save__label">Save current view</div>
          <div class="views-save__row">
            <input
              #nameInput
              type="text"
              class="views-save__input font-data"
              placeholder="e.g. BLR · WCHR · MTD"
              maxlength="48"
              [ngModel]="draftName()"
              (ngModelChange)="draftName.set($event)"
              (keydown.enter)="saveCurrent($event)"
              (keydown.escape)="cancelSave()" />
            <button
              type="button"
              class="views-save__btn"
              [disabled]="!canSave()"
              (click)="saveCurrent($event)">
              Save
            </button>
          </div>
        </div>
      </div>
    </mat-menu>
  `,
  styles: [`
    :host { display: inline-flex; }

    .views-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 44px;
      padding: 0 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      cursor: pointer;
      transition: border-color 180ms ease, background 180ms ease;
    }

    .views-btn:hover { border-color: var(--border-strong); }

    .views-btn__label { line-height: 1; }

    .views-btn__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      background: var(--accent-bg);
      color: var(--accent-fg);
      border-radius: 9px;
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
    }

    .views-btn__caret { color: var(--muted); flex-shrink: 0; }

    // Menu panel styles live in global styles.scss under .mat-mdc-menu-panel.views-menu
    // because mat-menu portals its content out of the component host, so :host ::ng-deep
    // selectors don't match the portaled panel.
  `],
})
export class SavedViewsMenuComponent {
  @ViewChild(MatMenuTrigger) trigger?: MatMenuTrigger;
  @ViewChild('nameInput') nameInput?: { nativeElement: HTMLInputElement };

  store = inject(SavedViewsStore);
  private filters = inject(FilterStore);

  draftName = signal('');

  canSave(): boolean {
    return this.draftName().trim().length > 0;
  }

  onMenuOpened(): void {
    // Auto-focus the save input when the menu opens, but only after the
    // menu has rendered. matMenu uses a slight delay for its overlay.
    setTimeout(() => {
      const el = document.querySelector('.views-save__input') as HTMLInputElement | null;
      el?.focus();
    }, 60);
  }

  saveCurrent(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.canSave()) return;
    this.store.save(this.draftName(), {
      airport: [...this.filters.airport()],
      datePreset: this.filters.datePreset(),
      dateFrom: this.filters.dateFrom(),
      dateTo: this.filters.dateTo(),
      airline: [...this.filters.airline()],
      service: [...this.filters.service()],
      handledBy: [...this.filters.handledBy()],
    });
    this.draftName.set('');
  }

  cancelSave(): void {
    this.draftName.set('');
    this.trigger?.closeMenu();
  }

  apply(v: SavedView): void {
    const f = v.filters;
    // Translate SavedView's camelCase shape into the snake_case CSV form the
    // FilterStore expects via loadFromQueryParams (which re-parses CSV → array).
    this.filters.loadFromQueryParams({
      airport: (f.airport ?? []).join(','),
      date_from: f.dateFrom ?? '',
      date_to: f.dateTo ?? '',
      airline: (f.airline ?? []).join(','),
      service: (f.service ?? []).join(','),
      handled_by: (f.handledBy ?? []).join(','),
    });
    this.filters.setDateRange(
      (f.datePreset as any) || 'custom',
      f.dateFrom ?? '',
      f.dateTo ?? '',
    );
    this.trigger?.closeMenu();
  }

  remove(id: string, e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    this.store.delete(id);
  }

  isActive(v: SavedView): boolean {
    const f = v.filters;
    return (
      sameSet(f.airport ?? [], this.filters.airport()) &&
      f.datePreset === this.filters.datePreset() &&
      (f.dateFrom ?? '') === this.filters.dateFrom() &&
      (f.dateTo ?? '') === this.filters.dateTo() &&
      sameSet(f.airline ?? [], this.filters.airline()) &&
      sameSet(f.service ?? [], this.filters.service()) &&
      sameSet(f.handledBy ?? [], this.filters.handledBy())
    );
  }

  describe(v: SavedView): string {
    const bits: string[] = [];
    const f = v.filters;
    if (f.airport && f.airport.length > 0) bits.push(summarize('Airports', f.airport));
    bits.push(this.labelForPreset(f.datePreset));
    if (f.airline && f.airline.length > 0) bits.push(summarize('Airlines', f.airline));
    if (f.service && f.service.length > 0) bits.push(summarize('Services', f.service));
    if (f.handledBy && f.handledBy.length > 0) bits.push(summarize('Handled', f.handledBy));
    return bits.join(' · ');
  }

  private labelForPreset(key: string): string {
    const map: Record<string, string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      last7: 'Last 7d',
      last30: 'Last 30d',
      mtd: 'MTD',
      last_month: 'Last mo',
      last_3_months: 'Last 3mo',
      last_6_months: 'Last 6mo',
      ytd: 'YTD',
      calendar_year: 'Cal year',
      last_year: 'Last year',
      q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4',
      qtd: 'QTD',
      custom: 'Custom',
    };
    return map[key] ?? key;
  }
}

/** True when two string arrays hold the same values regardless of order. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}

/**
 * Compact label for a multi-value filter in the view description row.
 * `["AI"]` → `"AI"`, `["AI","BA"]` → `"AI +1"`, `["AI","BA","CX"]` → `"AI +2"`.
 */
function summarize(_label: string, values: readonly string[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return values[0];
  return `${values[0]} +${values.length - 1}`;
}
