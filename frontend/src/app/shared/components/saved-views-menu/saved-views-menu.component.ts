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
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 12px;
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

    :host ::ng-deep .views-menu {
      min-width: 280px !important;
      max-width: 320px !important;
    }

    :host ::ng-deep .views-menu .mat-mdc-menu-content { padding: 0 !important; }

    :host ::ng-deep .views-wrap { padding: 6px; }

    :host ::ng-deep .views-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }

    :host ::ng-deep .views-head__count {
      font-size: 10px;
      color: var(--muted);
      background: var(--surface-2);
      padding: 2px 6px;
      border-radius: 4px;
    }

    :host ::ng-deep .views-empty {
      padding: 16px 12px 18px;
      text-align: left;
    }

    :host ::ng-deep .views-empty__title {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 4px;
    }

    :host ::ng-deep .views-empty__hint {
      font-size: 11px;
      color: var(--muted);
      line-height: 1.5;
    }

    :host ::ng-deep .views-list {
      max-height: 260px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 0 0 4px;
    }

    :host ::ng-deep .view-row {
      display: flex;
      align-items: stretch;
      gap: 4px;
      border-radius: 6px;
      position: relative;
    }

    :host ::ng-deep .view-row:hover { background: var(--surface-2); }
    :host ::ng-deep .view-row.active { background: var(--accent-bg); }

    :host ::ng-deep .view-row__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 8px 10px 8px 12px;
      background: transparent;
      border: none;
      border-radius: 6px;
      font-family: var(--font-sans);
      color: var(--ink);
      cursor: pointer;
      text-align: left;
      min-width: 0;
    }

    :host ::ng-deep .view-row__name {
      font-size: 12px;
      font-weight: 500;
      color: var(--ink);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host ::ng-deep .view-row.active .view-row__name {
      color: var(--accent-fg);
      font-weight: 600;
    }

    :host ::ng-deep .view-row__meta {
      font-size: 10px;
      color: var(--muted);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host ::ng-deep .view-row__del {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      margin-right: 4px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--muted);
      cursor: pointer;
      opacity: 0;
      transition: opacity 160ms ease, background 160ms ease, color 160ms ease;
    }

    :host ::ng-deep .view-row:hover .view-row__del { opacity: 1; }

    :host ::ng-deep .view-row__del:hover {
      background: var(--surface);
      color: var(--danger);
    }

    :host ::ng-deep .views-save {
      margin-top: 4px;
      padding: 10px 12px 8px;
      border-top: 1px solid var(--border);
    }

    :host ::ng-deep .views-save__label {
      color: var(--muted);
      font-size: 10px;
      margin-bottom: 8px;
    }

    :host ::ng-deep .views-save__row {
      display: flex;
      gap: 6px;
    }

    :host ::ng-deep .views-save__input {
      flex: 1;
      height: 30px;
      padding: 0 10px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink);
      transition: border-color 160ms ease, background 160ms ease;
      min-width: 0;
    }

    :host ::ng-deep .views-save__input::placeholder { color: var(--muted); }

    :host ::ng-deep .views-save__input:focus {
      outline: none;
      border-color: var(--accent);
      background: var(--surface);
    }

    :host ::ng-deep .views-save__btn {
      height: 30px;
      padding: 0 12px;
      background: var(--ink);
      border: 1px solid var(--ink);
      border-radius: 6px;
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      color: var(--bg);
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease, opacity 160ms ease;
    }

    :host ::ng-deep .views-save__btn:hover:not(:disabled) {
      background: var(--accent);
      border-color: var(--accent);
    }

    :host ::ng-deep .views-save__btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
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
      airport: this.filters.airport(),
      datePreset: this.filters.datePreset(),
      dateFrom: this.filters.dateFrom(),
      dateTo: this.filters.dateTo(),
      airline: this.filters.airline(),
      service: this.filters.service(),
      handledBy: this.filters.handledBy(),
    });
    this.draftName.set('');
  }

  cancelSave(): void {
    this.draftName.set('');
    this.trigger?.closeMenu();
  }

  apply(v: SavedView): void {
    const f = v.filters;
    // Translate SavedView's camelCase shape into the snake_case the FilterStore
    // expects via loadFromQueryParams. Also restore date preset explicitly
    // because loadFromQueryParams only handles dateFrom/dateTo.
    this.filters.loadFromQueryParams({
      airport: f.airport ?? '',
      date_from: f.dateFrom ?? '',
      date_to: f.dateTo ?? '',
      airline: f.airline ?? '',
      service: f.service ?? '',
      handled_by: f.handledBy ?? '',
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
      (f.airport ?? '') === this.filters.airport() &&
      f.datePreset === this.filters.datePreset() &&
      (f.dateFrom ?? '') === this.filters.dateFrom() &&
      (f.dateTo ?? '') === this.filters.dateTo() &&
      (f.airline ?? '') === this.filters.airline() &&
      (f.service ?? '') === this.filters.service() &&
      (f.handledBy ?? '') === this.filters.handledBy()
    );
  }

  describe(v: SavedView): string {
    const bits: string[] = [];
    const f = v.filters;
    if (f.airport) bits.push(f.airport);
    bits.push(this.labelForPreset(f.datePreset));
    if (f.airline) bits.push(f.airline);
    if (f.service) bits.push(f.service);
    if (f.handledBy) bits.push(f.handledBy);
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
