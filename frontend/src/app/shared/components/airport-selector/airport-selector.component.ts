import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { AuthStore } from '../../../core/store/auth.store';
import { FilterStore } from '../../../core/store/filter.store';

@Component({
  selector: 'app-airport-selector',
  standalone: true,
  imports: [CommonModule, MatMenuModule],
  template: `
    <button
      class="ap"
      [matMenuTriggerFor]="airportMenu"
      [disabled]="airports().length <= 1"
      type="button"
      [attr.aria-label]="'Airport: ' + (activeAirport()?.name ?? 'none')">
      <div class="ap__icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      </div>

      <div class="ap__body">
        <div class="ap__code font-data">{{ activeAirport()?.code ?? '—' }}</div>
        <div class="ap__name">{{ activeAirport()?.name ?? 'No airport' }}</div>
      </div>

      <div class="ap__count" *ngIf="airports().length > 1">
        <span class="font-data">{{ airports().length }}</span>
      </div>

      <svg *ngIf="airports().length > 1" class="ap__caret" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <mat-menu #airportMenu="matMenu" xPosition="before" class="ap-menu">
      <div class="ap-menu__wrap">
        <div class="ap-menu__head">
          <div class="label-micro">Select station</div>
        </div>
        @for (a of airports(); track a.code) {
          <button
            mat-menu-item
            type="button"
            class="ap-menu__item"
            [class.is-active]="a.code === filters.airport()"
            (click)="onSelect(a.code)">
            <div class="ap-menu__code font-data">{{ a.code }}</div>
            <div class="ap-menu__name">{{ a.name }}</div>
            @if (a.code === filters.airport()) {
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" class="ap-menu__check">
                <path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            }
          </button>
        }
      </div>
    </mat-menu>
  `,
  styles: [`
    :host { display: block; }

    .ap {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 12px 4px 10px;
      height: 44px;
      min-width: 240px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 180ms ease, background 180ms ease;
      font-family: var(--font-sans);
      text-align: left;
    }

    .ap:hover:not([disabled]) {
      border-color: var(--border-strong);
    }

    .ap[disabled] {
      cursor: default;
    }

    .ap__icon {
      flex-shrink: 0;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ap__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      line-height: 1.15;
    }

    .ap__code {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      letter-spacing: 0.02em;
    }

    .ap__name {
      font-size: 10px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--border);
    }

    .ap__count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 7px;
      height: 18px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 10px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .ap__caret {
      color: var(--muted);
      flex-shrink: 0;
    }

    // Menu
    :host ::ng-deep .ap-menu {
      min-width: 280px !important;
    }

    :host ::ng-deep .ap-menu__wrap {
      padding: 6px;
    }

    :host ::ng-deep .ap-menu__head {
      padding: 8px 12px 10px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }

    :host ::ng-deep .ap-menu__item {
      display: flex !important;
      align-items: center !important;
      gap: 14px !important;
      padding: 10px 12px !important;
      border-radius: 6px !important;
      margin: 1px 0 !important;
      min-height: auto !important;
      line-height: 1.2 !important;
      font-family: var(--font-sans) !important;
    }

    :host ::ng-deep .ap-menu__item.is-active {
      background: var(--accent-bg) !important;
    }

    :host ::ng-deep .ap-menu__item.is-active .ap-menu__code,
    :host ::ng-deep .ap-menu__item.is-active .ap-menu__name {
      color: var(--accent-fg) !important;
    }

    :host ::ng-deep .ap-menu__code {
      font-family: var(--font-mono) !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: var(--ink) !important;
      min-width: 36px !important;
    }

    :host ::ng-deep .ap-menu__name {
      flex: 1 !important;
      font-size: 12px !important;
      color: var(--muted) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    :host ::ng-deep .ap-menu__check {
      color: var(--accent-fg) !important;
      flex-shrink: 0;
    }
  `],
})
export class AirportSelectorComponent {
  private auth = inject(AuthStore);
  filters = inject(FilterStore);

  airports = computed(() => this.auth.employee()?.airports ?? []);
  activeAirport = computed<{ code: string; name: string } | undefined>(() => {
    const code = this.filters.airport();
    return this.airports().find((a) => a.code === code) ?? this.airports()[0];
  });

  constructor() {
    effect(() => {
      const list = this.airports();
      if (list.length > 0 && !this.filters.airport()) {
        this.filters.setAirport(list[0].code);
      }
    }, { allowSignalWrites: true });
  }

  onSelect(code: string): void {
    this.filters.setAirport(code);
    this.filters.clearSecondary();
  }
}
