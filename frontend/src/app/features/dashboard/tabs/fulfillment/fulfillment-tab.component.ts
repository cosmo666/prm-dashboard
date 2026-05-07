import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, EMPTY, forkJoin, Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { FilterStore } from 'src/app/core/store/filter.store';
import { PrmDataService } from '../../services/prm-data.service';
import { LineSeries } from 'src/app/shared/charts/line-chart/line-chart.component';
import { BarDatum } from 'src/app/shared/charts/bar-chart/bar-chart.component';

// Time-of-day bin colours: muted operational tones, NOT vivid. The 08-12
// morning peak gets a soft red, midday/early-afternoon amber, evening grey,
// late-evening green. Mirrors main's BIN_COLORS verbatim so the visual
// language stays identical between branches.
const BIN_COLORS: { [bin: string]: string } = {
  '00-04': '#90a4ae',
  '04-08': '#90a4ae',
  '08-12': '#ef5350',
  '12-16': '#fb8c00',
  '16-20': '#fb8c00',
  '20-24': '#66bb6a',
};

const BIN_KEYS: string[] = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24'];

/**
 * Bucket an hour (0..23) into one of six 4-hour windows.
 * TS 3.4.5 has no String.padStart — use the ('00' + n).slice(-2) idiom.
 * Exported only for spec testability.
 */
export function timeBin(hour: number): string {
  const start = Math.floor(hour / 4) * 4;
  const end = start + 4;
  const pad = (n: number): string => ('00' + n).slice(-2);
  return pad(start) + '-' + pad(end);
}

@Component({
  selector: 'app-fulfillment-tab',
  templateUrl: './fulfillment-tab.component.html',
  styleUrls: ['./fulfillment-tab.component.scss'],
})
export class FulfillmentTabComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading$ = new BehaviorSubject<boolean>(true);

  // KPIs
  totalRequested$ = new BehaviorSubject<number>(0);
  totalProvided$ = new BehaviorSubject<number>(0);
  providedPct$ = new BehaviorSubject<number>(0);
  walkupRate$ = new BehaviorSubject<number>(0);

  // Derived subtext data
  walkupCount$ = new BehaviorSubject<number>(0);    // totalProvided - totalRequested (clamped ≥0)
  bookedSharePct$ = new BehaviorSubject<number>(0); // pre-booked share of total demand

  // Charts
  dualAxisSeries$ = new BehaviorSubject<LineSeries[]>([]);
  timeOfDay$ = new BehaviorSubject<BarDatum[]>([]);
  cumulativeSeries$ = new BehaviorSubject<LineSeries[]>([]);

  constructor(
    public filters: FilterStore,
    private data: PrmDataService,
  ) {}

  ngOnInit(): void {
    this.filters.queryParams$.pipe(
      debounceTime(50),
      switchMap(() => {
        if (this.filters.airportSnapshot.length === 0 || !this.filters.dateFromSnapshot) {
          return EMPTY;
        }
        this.loading$.next(true);
        return forkJoin({
          rvp: this.data.requestedVsProvided(),
          trend: this.data.trendsRequestedProvided(),
          hourly: this.data.trendsHourly(),
          daily: this.data.trendsDaily('count'),
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe(
      r => {
        // ── KPIs from RequestedVsProvidedKpiResponse ──
        const totalReq = r.rvp.totalRequested || 0;
        const totalProv = r.rvp.totalProvided || 0;
        this.totalRequested$.next(totalReq);
        this.totalProvided$.next(totalProv);
        this.providedPct$.next(r.rvp.fulfillmentRate || 0);
        this.walkupRate$.next(r.rvp.walkUpRate || 0);

        // Walk-ups = provided - pre-booked (clamped ≥ 0). Booked-share is
        // the inverse view of walk-up rate, computed against TOTAL provided
        // so it reads as "X% of demand was scheduled in advance".
        const walkups = Math.max(0, totalProv - totalReq);
        this.walkupCount$.next(walkups);
        this.bookedSharePct$.next(totalProv > 0 ? (totalReq / totalProv) * 100 : 0);

        // ── Daily Provided vs Requested (dual-axis bar + line) ──
        // Slice the date to its DD suffix for the x-axis label so labels
        // stay legible at month-long ranges; the tooltip still shows the
        // full date because echarts uses the full category string there.
        const dates: string[] = r.trend.dates || [];
        const provided: number[] = r.trend.provided || [];
        const requested: number[] = r.trend.requested || [];
        this.dualAxisSeries$.next([
          {
            name: 'Provided', type: 'bar', color: '#1e88e5',
            data: dates.map((d, i): [string, number] => [d.slice(-2), provided[i] || 0]),
          },
          {
            name: 'Requested', type: 'line', color: '#fb8c00',
            data: dates.map((d, i): [string, number] => [d.slice(-2), requested[i] || 0]),
          },
        ]);

        // ── Time of Day (4-hour bins) from HourlyHeatmapResponse ──
        const hDays: string[] = r.hourly.days || [];
        const hHours: number[] = r.hourly.hours || [];
        const hValues: number[][] = r.hourly.values || [];
        const bins: { [bin: string]: number } = {
          '00-04': 0, '04-08': 0, '08-12': 0, '12-16': 0, '16-20': 0, '20-24': 0,
        };
        for (let di = 0; di < hDays.length; di++) {
          const row = hValues[di] || [];
          for (let hi = 0; hi < hHours.length; hi++) {
            const bin = timeBin(hHours[hi]);
            bins[bin] = (bins[bin] || 0) + (row[hi] || 0);
          }
        }
        this.timeOfDay$.next(BIN_KEYS.map(b => ({
          label: b,
          value: bins[b],
          color: BIN_COLORS[b],
        })));

        // ── Cumulative pace (Actual area + even-pace Target line) ──
        const dailyDates: string[] = r.daily.dates || [];
        const dailyVals: number[] = r.daily.values || [];
        let cum = 0;
        const cumData: Array<[string, number]> = dailyDates.map((d, i) => {
          cum += dailyVals[i] || 0;
          return [d.slice(-2), cum] as [string, number];
        });
        const totalDays = dailyDates.length || 1;
        const finalTotal = cum;
        const targetData: Array<[string, number]> = dailyDates.map((d, i) =>
          [d.slice(-2), (finalTotal / totalDays) * (i + 1)] as [string, number],
        );
        this.cumulativeSeries$.next([
          { name: 'Actual', type: 'area', color: '#1e88e5', data: cumData },
          { name: 'Target', type: 'line', color: '#888',    data: targetData },
        ]);

        this.loading$.next(false);
      },
      err => {
        console.error('[fulfillment] forkJoin failed', err);
        this.loading$.next(false);
      },
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
