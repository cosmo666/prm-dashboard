// Static demo annotations for chart overlays.
// No backend API — these are hardcoded notable dates rendered as
// dashed markLines on the daily trend chart.

export interface ChartAnnotation {
  /** yyyy-mm-dd */
  date: string;
  /** Short label shown at the top of the vertical line */
  label: string;
  type?: 'event' | 'holiday' | 'incident';
}

export const DEMO_ANNOTATIONS: ChartAnnotation[] = [
  { date: '2025-12-25', label: 'Christmas', type: 'holiday' },
  { date: '2026-01-01', label: 'New Year', type: 'holiday' },
  { date: '2026-01-26', label: 'Republic Day', type: 'holiday' },
  { date: '2026-03-17', label: 'Holi', type: 'holiday' },
];
