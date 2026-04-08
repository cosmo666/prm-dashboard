import { environment } from '../../../../environments/environment';
import { DatePreset } from '../../../core/store/filter.store';

// POC_TODAY is hardcoded via environment config because seed data ends at 2026-03-31.
// Production builds should remove this and use `new Date()` directly.
const [pocY, pocM, pocD] = environment.pocToday.split('-').map(Number);
export const POC_TODAY = new Date(pocY, pocM - 1, pocD);

function iso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

export interface PresetRange { from: string; to: string; label: string; }

export const PRESET_DEFS: Array<{ key: DatePreset; label: string }> = [
  { key: 'today',         label: 'Today' },
  { key: 'yesterday',     label: 'Yesterday' },
  { key: 'last7',         label: 'Last 7 Days' },
  { key: 'last30',        label: 'Last 30 Days' },
  { key: 'mtd',           label: 'Month to Date' },
  { key: 'last_month',    label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'ytd',           label: 'Year to Date' },
  { key: 'calendar_year', label: 'Calendar Year' },
  { key: 'last_year',     label: 'Last Year' },
  { key: 'q1',            label: 'Q1 (Jan-Mar)' },
  { key: 'q2',            label: 'Q2 (Apr-Jun)' },
  { key: 'q3',            label: 'Q3 (Jul-Sep)' },
  { key: 'q4',            label: 'Q4 (Oct-Dec)' },
  { key: 'custom',        label: 'Custom Range' },
];

export function resolvePreset(preset: DatePreset, today: Date = POC_TODAY): PresetRange {
  const y = today.getFullYear(), m = today.getMonth();
  const label = PRESET_DEFS.find(p => p.key === preset)?.label ?? '';
  switch (preset) {
    case 'today':         return { from: iso(today), to: iso(today), label };
    case 'yesterday':     { const d = addDays(today, -1); return { from: iso(d), to: iso(d), label }; }
    case 'last7':         return { from: iso(addDays(today, -6)), to: iso(today), label };
    case 'last30':        return { from: iso(addDays(today, -29)), to: iso(today), label };
    case 'mtd':           return { from: iso(new Date(y, m, 1)), to: iso(today), label };
    case 'last_month': {
      const first = new Date(y, m - 1, 1);
      const last  = new Date(y, m, 0);
      return { from: iso(first), to: iso(last), label };
    }
    case 'last_3_months': return { from: iso(new Date(y, m - 3, 1)), to: iso(new Date(y, m, 0)), label };
    case 'last_6_months': return { from: iso(new Date(y, m - 6, 1)), to: iso(new Date(y, m, 0)), label };
    case 'ytd':           return { from: iso(new Date(y, 0, 1)), to: iso(today), label };
    case 'calendar_year': return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)), label };
    case 'last_year':     return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)), label };
    case 'q1':            return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 2, 31)), label };
    case 'q2':            return { from: iso(new Date(y, 3, 1)), to: iso(new Date(y, 5, 30)), label };
    case 'q3':            return { from: iso(new Date(y, 6, 1)), to: iso(new Date(y, 8, 30)), label };
    case 'q4':            return { from: iso(new Date(y, 9, 1)), to: iso(new Date(y, 11, 31)), label };
    case 'qtd':           return { from: iso(new Date(y, Math.floor(m / 3) * 3, 1)), to: iso(today), label };
    case 'custom':        return { from: '', to: '', label };
  }
}
