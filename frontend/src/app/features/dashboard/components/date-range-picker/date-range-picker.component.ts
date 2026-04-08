import { Component, inject, ElementRef, ViewChild, ViewChildren, QueryList, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { FilterStore, DatePreset } from '../../../../core/store/filter.store';
import { PRESET_DEFS, resolvePreset } from '../../utils/date-presets';

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatMenuModule],
  template: `
    <button
      #trigger
      class="range-btn"
      [matMenuTriggerFor]="menu"
      type="button"
      (keydown)="onTriggerKeydown($event)"
      [attr.aria-label]="'Date range: ' + currentLabel() + ', ' + rangeDisplay()">
      <div class="range-btn__icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <rect x="1.5" y="2.5" width="11" height="10" rx="1.25" stroke="currentColor" stroke-width="1.2"/>
          <path d="M1.5 5.5h11M4.5 1v2M9.5 1v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="range-btn__body">
        <div class="range-btn__label">{{ currentLabel() }}</div>
        <div class="range-btn__range font-data">{{ rangeDisplay() }}</div>
      </div>
      <svg class="range-btn__caret" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <mat-menu #menu="matMenu" class="date-preset-menu" xPosition="before">
      <div class="preset-wrap" (keydown)="onMenuKeydown($event)">
        <div class="preset-head">
          <div class="label-micro">Date range</div>
          <div class="preset-head__hint font-data">↑ ↓ ↵</div>
        </div>
        <div class="preset-list">
          @for (p of presets; track p.key; let i = $index) {
            <button
              #item
              mat-menu-item
              type="button"
              class="preset-item"
              [class.active]="filters.datePreset() === p.key"
              (click)="select(p.key, $event)">
              <div class="preset-item__label">{{ p.label }}</div>
              <div class="preset-item__range font-data">{{ presetRange(p.key) }}</div>
              @if (filters.datePreset() === p.key) {
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" class="preset-item__check">
                  <path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              }
            </button>
          }

          <!-- Custom row: NOT a mat-menu-item, so clicking it doesn't auto-close the menu -->
          <button
            type="button"
            class="preset-item preset-item--custom"
            [class.active]="filters.datePreset() === 'custom' || showCustom()"
            (click)="openCustom($event)">
            <div class="preset-item__label">Custom Range</div>
            <div class="preset-item__range font-data">
              {{ filters.datePreset() === 'custom' ? rangeDisplay() : 'Pick dates →' }}
            </div>
            @if (filters.datePreset() === 'custom') {
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" class="preset-item__check">
                <path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            }
          </button>
        </div>

        @if (showCustom()) {
          <div class="custom-panel" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
            <div class="custom-panel__head label-micro">Custom range</div>
            <div class="custom-panel__row">
              <label class="custom-field">
                <span class="custom-field__label">From</span>
                <input
                  type="date"
                  class="custom-field__input font-data"
                  [(ngModel)]="customFrom"
                  [max]="customTo() || undefined" />
              </label>
              <label class="custom-field">
                <span class="custom-field__label">To</span>
                <input
                  type="date"
                  class="custom-field__input font-data"
                  [(ngModel)]="customTo"
                  [min]="customFrom() || undefined" />
              </label>
            </div>
            <div class="custom-panel__actions">
              <button type="button" class="custom-btn custom-btn--ghost" (click)="cancelCustom()">Cancel</button>
              <button
                type="button"
                class="custom-btn custom-btn--primary"
                [disabled]="!canApplyCustom()"
                (click)="applyCustom()">Apply</button>
            </div>
          </div>
        }
      </div>
    </mat-menu>
  `,
  styles: [`
    :host { display: block; }

    // Trigger
    .range-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 12px 4px 10px;
      height: 44px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: var(--font-sans);
      color: var(--ink);
      cursor: pointer;
      width: 100%;
      min-width: 240px;
      transition: border-color 180ms ease, background 180ms ease;
      text-align: left;
    }

    .range-btn:hover {
      border-color: var(--border-strong);
    }

    .range-btn__icon {
      color: var(--muted);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .range-btn__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.15;
    }

    .range-btn__label {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
    }

    .range-btn__range {
      font-size: 10px;
      color: var(--muted);
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .range-btn__caret {
      color: var(--muted);
      flex-shrink: 0;
    }

    // Menu
    :host ::ng-deep .date-preset-menu {
      min-width: 320px !important;
      max-width: 360px !important;
    }

    :host ::ng-deep .preset-wrap {
      padding: 6px;
    }

    :host ::ng-deep .preset-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }

    :host ::ng-deep .preset-head__hint {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.08em;
    }

    :host ::ng-deep .preset-list {
      max-height: 360px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    :host ::ng-deep .preset-item {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 8px 12px !important;
      min-height: auto !important;
      border-radius: 6px !important;
      font-family: var(--font-sans) !important;
      font-size: 12px !important;
      line-height: 1.25 !important;
      position: relative;
      color: var(--ink) !important;
    }

    :host ::ng-deep .preset-item.active {
      background: var(--accent-bg) !important;
    }

    :host ::ng-deep .preset-item.active .preset-item__label {
      color: var(--accent-fg) !important;
      font-weight: 600 !important;
    }

    :host ::ng-deep .preset-item__label {
      flex: 1;
      color: var(--ink);
      font-weight: 500;
    }

    :host ::ng-deep .preset-item__range {
      font-size: 10px;
      color: var(--muted);
      white-space: nowrap;
    }

    :host ::ng-deep .preset-item__check {
      color: var(--accent-fg);
      margin-left: 4px;
      flex-shrink: 0;
    }

    // Custom row (plain button — matches preset-item visuals)
    :host ::ng-deep button.preset-item--custom {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-family: var(--font-sans);
      font-size: 12px;
      line-height: 1.25;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
      margin-top: 4px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    :host ::ng-deep button.preset-item--custom:hover {
      background: var(--surface-2);
    }

    :host ::ng-deep button.preset-item--custom.active {
      background: var(--accent-bg);
    }

    :host ::ng-deep button.preset-item--custom.active .preset-item__label {
      color: var(--accent-fg);
      font-weight: 600;
    }

    // Custom range panel
    :host ::ng-deep .custom-panel {
      margin-top: 6px;
      padding: 12px;
      border-top: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 6px;
    }

    :host ::ng-deep .custom-panel__head {
      margin-bottom: 10px;
      color: var(--muted);
    }

    :host ::ng-deep .custom-panel__row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }

    :host ::ng-deep .custom-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    :host ::ng-deep .custom-field__label {
      font-family: var(--font-sans);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    :host ::ng-deep .custom-field__input {
      height: 32px;
      padding: 0 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 12px;
      color: var(--ink);
      font-family: var(--font-mono);
      transition: border-color 160ms ease;
    }

    :host ::ng-deep .custom-field__input:focus {
      outline: none;
      border-color: var(--accent);
    }

    :host ::ng-deep .custom-panel__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    :host ::ng-deep .custom-btn {
      height: 28px;
      padding: 0 12px;
      border-radius: 4px;
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      cursor: pointer;
      transition: background 160ms ease, border-color 160ms ease, opacity 160ms ease;
    }

    :host ::ng-deep .custom-btn--ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--ink-muted);
    }

    :host ::ng-deep .custom-btn--ghost:hover {
      border-color: var(--border-strong);
      color: var(--ink);
    }

    :host ::ng-deep .custom-btn--primary {
      background: var(--ink);
      border: 1px solid var(--ink);
      color: var(--bg);
    }

    :host ::ng-deep .custom-btn--primary:hover:not(:disabled) {
      background: var(--accent);
      border-color: var(--accent);
    }

    :host ::ng-deep .custom-btn--primary:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `],
})
export class DateRangePickerComponent {
  @ViewChild(MatMenuTrigger) trigger?: MatMenuTrigger;
  @ViewChildren('item') items?: QueryList<ElementRef<HTMLButtonElement>>;

  filters = inject(FilterStore);
  // Quick presets (everything except 'custom' — Custom gets its own row that doesn't auto-close the menu)
  presets = PRESET_DEFS.filter((p) => p.key !== 'custom');

  // Custom range panel state
  showCustom = signal(false);
  customFrom = signal('');
  customTo = signal('');

  canApplyCustom(): boolean {
    const f = this.customFrom();
    const t = this.customTo();
    return !!(f && t && f <= t);
  }

  currentLabel(): string {
    const p = PRESET_DEFS.find((x) => x.key === this.filters.datePreset());
    return p?.label ?? 'Select range';
  }

  rangeDisplay(): string {
    const from = this.filters.dateFrom();
    const to = this.filters.dateTo();
    if (!from || !to) return '—';
    return `${this.formatShort(from)} → ${this.formatShort(to)}`;
  }

  presetRange(key: DatePreset): string {
    const r = resolvePreset(key);
    if (!r.from || !r.to) return '';
    if (r.from === r.to) return this.formatShort(r.from);
    return `${this.formatShort(r.from)} → ${this.formatShort(r.to)}`;
  }

  select(preset: DatePreset, _e?: Event): void {
    this.showCustom.set(false);
    const r = resolvePreset(preset);
    this.filters.setDateRange(preset, r.from, r.to);
  }

  openCustom(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    // Seed inputs with current range so the user can tweak from where they are
    this.customFrom.set(this.filters.dateFrom() || '');
    this.customTo.set(this.filters.dateTo() || '');
    this.showCustom.set(true);
  }

  applyCustom(): void {
    if (!this.canApplyCustom()) return;
    this.filters.setDateRange('custom', this.customFrom(), this.customTo());
    this.showCustom.set(false);
    this.trigger?.closeMenu();
  }

  cancelCustom(): void {
    this.showCustom.set(false);
  }

  // Keyboard navigation on the trigger button opens the menu
  onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.trigger?.openMenu();
    }
  }

  // Keyboard navigation inside the menu
  onMenuKeydown(e: KeyboardEvent): void {
    const items = this.items?.toArray() ?? [];
    if (items.length === 0) return;

    const active = document.activeElement as HTMLElement | null;
    const idx = items.findIndex((ref) => ref.nativeElement === active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx < items.length - 1 ? idx + 1 : 0;
      items[next].nativeElement.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx > 0 ? idx - 1 : items.length - 1;
      items[prev].nativeElement.focus();
    }
  }

  // Short display: "Dec 1" / "Mar 31 2026"
  private formatShort(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = months[d.getMonth()];
    return `${m} ${d.getDate()}`;
  }
}
