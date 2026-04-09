import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number with thousand separators for dashboard display.
 * Pipe name kept as `compactNumber` for backwards compatibility with
 * existing template bindings, but the behavior is now full-number
 * formatting — e.g. `1712` renders as `"1,712"`, not `"1.7k"`.
 *
 * Rationale: operational dashboards benefit from exact figures so
 * operators can distinguish 1,712 from 1,689 — compact notation
 * (`1.7k`) hides small but meaningful differences across airports.
 *
 * Examples:
 *   1712          -> "1,712"
 *   15234         -> "15,234"
 *   1500000       -> "1,500,000"
 *   999           -> "999"
 *   1712.56       -> "1,712.56"  (decimals preserved up to 2 places)
 *   null / ''     -> "—"
 *
 * Usage: `{{ value | compactNumber }}`
 *        `{{ value | compactNumber:0 }}` — force integer display
 */
@Pipe({
  name: 'compactNumber',
  standalone: true,
  pure: true,
})
export class CompactNumberPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    maxFractionDigits: number = 2,
  ): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '—';

    const isInt = Number.isInteger(n);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: isInt ? 0 : maxFractionDigits,
      useGrouping: true,
    }).format(n);
  }
}
