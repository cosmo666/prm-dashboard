import { Component, inject, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { FilterStore, DatePreset } from '../../../../core/store/filter.store';
import { PRESET_DEFS, resolvePreset, POC_TODAY } from '../../utils/date-presets';

/**
 * Two-panel date range picker:
 *   Left  — scrollable list of 15 quick presets + "Custom Range"
 *   Right — always-visible MatCalendar in range-selection mode, with
 *           From/To pills above the month header
 *
 * User flow:
 *   * Click a preset → applies immediately, closes menu
 *   * Click a calendar day → sets From (if no range) or To (if only From),
 *     or restarts range (if both set). When both From and To exist, the
 *     filter is applied immediately via the effect below.
 *
 * Wire contract preserved: still calls FilterStore.setDateRange(preset,
 * from, to) with ISO `YYYY-MM-DD` strings so the rest of the dashboard
 * doesn't need to change.
 */
@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, MatMenuModule, MatDatepickerModule, MatNativeDateModule],
  template: `
    <button
      #trigger
      class="range-btn"
      [matMenuTriggerFor]="menu"
      type="button"
      (menuOpened)="onMenuOpened()"
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

    <mat-menu #menu="matMenu" class="drp-menu" xPosition="before">
      <div class="drp-wrap" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">

        <!-- Left: preset list -->
        <aside class="drp-presets">
          <div class="drp-presets__head label-micro">Quick presets</div>
          <ul class="drp-presets__list">
            @for (p of presets; track p.key) {
              <li>
                <button
                  type="button"
                  class="drp-preset"
                  [class.is-active]="filters.datePreset() === p.key"
                  (click)="selectPreset(p.key)">
                  <span class="drp-preset__label">{{ p.label }}</span>
                  <span class="drp-preset__range font-data">{{ presetRange(p.key) }}</span>
                </button>
              </li>
            }
            <li class="drp-preset-divider"></li>
            <li>
              <button
                type="button"
                class="drp-preset drp-preset--custom"
                [class.is-active]="filters.datePreset() === 'custom'"
                (click)="$event.stopPropagation()">
                <span class="drp-preset__label">Custom Range</span>
                <span class="drp-preset__range font-data">Pick on calendar →</span>
              </button>
            </li>
          </ul>
        </aside>

        <!-- Right: calendar -->
        <section class="drp-cal">
          <div class="drp-cal__pills">
            <div class="drp-pill" [class.drp-pill--active]="pickingStart()">
              <span class="label-micro">From</span>
              <span class="drp-pill__value font-data">{{ formatFriendly(draftFrom()) || '—' }}</span>
            </div>
            <div class="drp-pill__arrow">→</div>
            <div class="drp-pill" [class.drp-pill--active]="!pickingStart()">
              <span class="label-micro">To</span>
              <span class="drp-pill__value font-data">{{ formatFriendly(draftTo()) || '—' }}</span>
            </div>
            @if (draftFrom() || draftTo()) {
              <button type="button" class="drp-cal__clear" (click)="resetDraft()" aria-label="Clear selection">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            }
          </div>

          <mat-calendar
            class="drp-calendar"
            [selected]="calendarSelection()"
            [startAt]="calendarStartAt()"
            [maxDate]="maxDate"
            (selectedChange)="onDayClick($event)">
          </mat-calendar>

          <div class="drp-cal__actions">
            <button
              type="button"
              class="drp-btn drp-btn--ghost"
              (click)="closeMenu()">Cancel</button>
            <button
              type="button"
              class="drp-btn drp-btn--primary"
              [disabled]="!canApply()"
              (click)="applyCustom()">Apply</button>
          </div>
        </section>
      </div>
    </mat-menu>
  `,
  styles: [`
    :host { display: block; }

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

    .range-btn:hover { border-color: var(--border-strong); }

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

    // All menu panel styles live in global styles.scss keyed on
    // .mat-mdc-menu-panel.drp-menu — see the "Date range picker menu"
    // block. Component-local :host ::ng-deep doesn't apply once
    // mat-menu portals into cdk-overlay-container.
  `],
})
export class DateRangePickerComponent {
  @ViewChild(MatMenuTrigger) trigger?: MatMenuTrigger;

  filters = inject(FilterStore);

  // All presets EXCEPT 'custom' — custom is the implicit mode when you
  // click dates on the calendar without picking a preset.
  presets = PRESET_DEFS.filter((p) => p.key !== 'custom');

  // Draft range shown in the calendar while the menu is open. Only
  // commits to the filter store when the user clicks Apply or picks
  // a preset.
  draftFrom = signal<Date | null>(null);
  draftTo = signal<Date | null>(null);

  // When true, the next day click sets `from`; otherwise it sets `to`.
  pickingStart = computed(() => !this.draftFrom() || (!!this.draftFrom() && !!this.draftTo()));

  // The POC dataset ends on 2026-03-31 — disable future dates so users
  // don't get an empty-result surprise by picking May.
  readonly maxDate = POC_TODAY;

  // What MatCalendar shows as "selected". We feed it only a single date
  // because we're implementing range selection manually (full range
  // selection in MatCalendar requires the component developer mode API
  // which is heavier than we need for this UX).
  calendarSelection = computed<Date | null>(() => {
    return this.draftTo() ?? this.draftFrom();
  });

  calendarStartAt = computed<Date | null>(() => {
    return this.draftFrom() ?? this.parseIso(this.filters.dateFrom()) ?? POC_TODAY;
  });

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

  onMenuOpened(): void {
    // Seed the draft with the currently applied filter so the calendar
    // opens already showing the active range.
    this.draftFrom.set(this.parseIso(this.filters.dateFrom()));
    this.draftTo.set(this.parseIso(this.filters.dateTo()));
  }

  selectPreset(preset: DatePreset): void {
    const r = resolvePreset(preset);
    this.filters.setDateRange(preset, r.from, r.to);
    this.trigger?.closeMenu();
  }

  onDayClick(day: Date | null): void {
    if (!day) return;

    // Three-state range selection cycle:
    //   * Nothing selected                      → set from
    //   * Only `from` set, clicked day >= from  → set to
    //   * Only `from` set, clicked day < from   → replace from
    //   * Both set                              → restart with new from
    const from = this.draftFrom();
    const to = this.draftTo();

    if (!from || (from && to)) {
      this.draftFrom.set(day);
      this.draftTo.set(null);
      return;
    }

    if (day.getTime() < from.getTime()) {
      this.draftFrom.set(day);
      this.draftTo.set(null);
      return;
    }

    this.draftTo.set(day);
  }

  canApply(): boolean {
    return !!(this.draftFrom() && this.draftTo());
  }

  applyCustom(): void {
    const from = this.draftFrom();
    const to = this.draftTo();
    if (!from || !to) return;
    this.filters.setDateRange('custom', this.isoOf(from), this.isoOf(to));
    this.trigger?.closeMenu();
  }

  resetDraft(): void {
    this.draftFrom.set(null);
    this.draftTo.set(null);
  }

  closeMenu(): void {
    this.trigger?.closeMenu();
  }

  formatFriendly(d: Date | null): string {
    if (!d) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  private formatShort(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }

  private parseIso(iso: string): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  private isoOf(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
}
