import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { OverlayPanel } from 'primeng/overlaypanel';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FilterStore, DatePreset } from 'src/app/core/store/filter.store';
import { PRESET_DEFS, resolvePreset } from '../../utils/date-presets';
import { POC_TODAY } from '../../utils/poc-today';

@Component({
  selector: 'app-date-range-picker',
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
})
export class DateRangePickerComponent implements OnInit, OnDestroy {
  // `static: true` because the panel ref is consumed inside ngOnInit.
  @ViewChild('panel', { static: true }) panel!: OverlayPanel;

  presets = PRESET_DEFS;
  currentLabel = '';
  rangeDisplay = '';
  rangeValue: Date[] = [];

  private destroy$ = new Subject<void>();

  constructor(public filters: FilterStore) {}

  ngOnInit(): void {
    this.filters.datePreset$.pipe(takeUntil(this.destroy$))
      .subscribe(p => this.recomputeLabels(p));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectPreset(p: DatePreset, _ev: Event): void {
    const r = resolvePreset(p, POC_TODAY);
    this.filters.setDateRange(p, r.from, r.to);
    this.panel.hide();
  }

  onCalendarSelect(): void {
    if (this.rangeValue.length === 2 && this.rangeValue[1]) {
      this.filters.setDateRange('custom', this.iso(this.rangeValue[0]), this.iso(this.rangeValue[1]));
    }
  }

  presetRange(p: DatePreset): string {
    const r = resolvePreset(p, POC_TODAY);
    if (!r.from || !r.to) { return ''; }
    return this.short(r.from) + ' – ' + this.short(r.to);
  }

  private recomputeLabels(p: DatePreset): void {
    const def = PRESET_DEFS.filter(x => x.key === p)[0];
    this.currentLabel = def ? def.label : '';
    this.rangeDisplay = this.short(this.filters.dateFromSnapshot) + ' – ' + this.short(this.filters.dateToSnapshot);
  }

  private iso(d: Date): string {
    const pad = (n: number): string => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  private short(isoDate: string): string {
    if (!isoDate) { return '—'; }
    const parts = isoDate.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
