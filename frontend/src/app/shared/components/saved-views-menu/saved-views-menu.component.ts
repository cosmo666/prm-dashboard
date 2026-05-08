import { Component, ViewChild } from '@angular/core';
import { OverlayPanel } from 'primeng/overlaypanel';
import { FilterStore, DatePreset } from 'src/app/core/store/filter.store';
import { SavedViewsStore, SavedView } from 'src/app/core/store/saved-views.store';
import { ToastService } from 'src/app/core/toast/toast.service';

const PRESET_LABELS: { [k: string]: string } = {
  today: 'Today', yesterday: 'Yesterday', last7: 'Last 7d', last30: 'Last 30d',
  mtd: 'MTD', last_month: 'Last mo', last_3_months: 'Last 3mo',
  last_6_months: 'Last 6mo', ytd: 'YTD', calendar_year: 'Cal year',
  last_year: 'Last year', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4',
  qtd: 'QTD', custom: 'Custom',
};

/** True when two string arrays hold the same values regardless of order. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) { return false; }
  const setB: { [k: string]: true } = {};
  for (const v of b) { setB[v] = true; }
  for (const v of a) { if (!setB[v]) { return false; } }
  return true;
}

/**
 * Compact label for a multi-value filter in the description row.
 * ["AI"] → "AI", ["AI","BA"] → "AI +1", ["AI","BA","CX"] → "AI +2".
 */
function summarize(values: string[]): string {
  if (values.length === 0) { return ''; }
  if (values.length === 1) { return values[0]; }
  return values[0] + ' +' + (values.length - 1);
}

@Component({
  selector: 'app-saved-views-menu',
  templateUrl: './saved-views-menu.component.html',
  styleUrls: ['./saved-views-menu.component.scss'],
})
export class SavedViewsMenuComponent {
  // `static: false` — the OverlayPanel lives in a *ngIf-free template and is
  // safe to query after view init; the trigger button's (click) handler is
  // the first consumer, so the ref is populated by the time it runs.
  @ViewChild(OverlayPanel, { static: false }) op!: OverlayPanel;

  draftName = '';

  constructor(
    public store: SavedViewsStore,
    private filters: FilterStore,
    private toast: ToastService,
  ) {}

  canSave(): boolean { return this.draftName.trim().length > 0; }

  trackById(_index: number, v: SavedView): string { return v.id; }

  saveCurrent(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.canSave()) { return; }
    const name = this.draftName.trim();
    this.store.save(name, {
      airport:    this.filters.airportSnapshot.slice(),
      datePreset: this.filters.datePresetSnapshot,
      dateFrom:   this.filters.dateFromSnapshot,
      dateTo:     this.filters.dateToSnapshot,
      airline:    this.filters.airlineSnapshot.slice(),
      service:    this.filters.serviceSnapshot.slice(),
      handledBy:  this.filters.handledBySnapshot.slice(),
    });
    this.toast.show('View saved: ' + name);
    this.draftName = '';
  }

  apply(v: SavedView): void {
    const f = v.filters;
    // Translate camelCase SavedView shape into the snake_case CSV form
    // FilterStore.hydrateFromQueryParams expects (it re-parses CSV → array
    // and writes every field back through the BehaviorSubjects in one
    // synchronous pass).
    this.filters.hydrateFromQueryParams({
      airport:    (f.airport    || []).join(','),
      date_from:  f.dateFrom    || '',
      date_to:    f.dateTo      || '',
      airline:    (f.airline    || []).join(','),
      service:    (f.service    || []).join(','),
      handled_by: (f.handledBy  || []).join(','),
    });
    // hydrateFromQueryParams forces preset='custom' whenever a date_from
    // or date_to is supplied — re-apply the saved preset so it doesn't
    // get clobbered. Same write order as setDateRange uses internally.
    this.filters.setDateRange(
      (f.datePreset as DatePreset) || 'custom',
      f.dateFrom || '',
      f.dateTo   || '',
    );
  }

  remove(id: string, e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    this.store.delete(id);
  }

  /**
   * True when v matches the FilterStore's current snapshot. The menu
   * uses this to highlight the currently-applied saved view.
   */
  isActive(v: SavedView): boolean {
    const f = v.filters;
    return (
      sameSet(f.airport   || [], this.filters.airportSnapshot)   &&
      f.datePreset === this.filters.datePresetSnapshot           &&
      f.dateFrom   === this.filters.dateFromSnapshot             &&
      f.dateTo     === this.filters.dateToSnapshot               &&
      sameSet(f.airline   || [], this.filters.airlineSnapshot)   &&
      sameSet(f.service   || [], this.filters.serviceSnapshot)   &&
      sameSet(f.handledBy || [], this.filters.handledBySnapshot)
    );
  }

  /**
   * One-line dot-separated description of a SavedView, used as the
   * metadata line below the view name. Picks the most informative
   * bits (airport / preset / airline / service / handler).
   */
  describe(v: SavedView): string {
    const bits: string[] = [];
    const f = v.filters;
    if (f.airport   && f.airport.length   > 0) { bits.push(summarize(f.airport));   }
    bits.push(PRESET_LABELS[f.datePreset] || f.datePreset);
    if (f.airline   && f.airline.length   > 0) { bits.push(summarize(f.airline));   }
    if (f.service   && f.service.length   > 0) { bits.push(summarize(f.service));   }
    if (f.handledBy && f.handledBy.length > 0) { bits.push(summarize(f.handledBy)); }
    return bits.join(' · ');
  }
}
