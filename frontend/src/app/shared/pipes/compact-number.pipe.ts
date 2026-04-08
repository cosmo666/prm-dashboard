import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number in compact notation with SI-like suffixes.
 *
 * Examples:
 *   1234       -> "1.23k"
 *   15234      -> "15.2k"
 *   1500000    -> "1.5M"
 *   999        -> "999"
 *   null/''    -> "—"
 *
 * Usage: `{{ value | compactNumber }}` or `{{ value | compactNumber:2 }}`
 */
@Pipe({
  name: 'compactNumber',
  standalone: true,
  pure: true,
})
export class CompactNumberPipe implements PipeTransform {
  transform(value: number | string | null | undefined, maxFractionDigits: number = 1): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '—';

    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';

    if (abs < 1000) {
      // Plain integer display for small values
      return sign + this.stripTrailingZero(abs.toFixed(Number.isInteger(abs) ? 0 : maxFractionDigits));
    }

    const units = [
      { limit: 1e12, suffix: 'T' },
      { limit: 1e9,  suffix: 'B' },
      { limit: 1e6,  suffix: 'M' },
      { limit: 1e3,  suffix: 'k' },
    ];

    for (const u of units) {
      if (abs >= u.limit) {
        const scaled = abs / u.limit;
        return sign + this.stripTrailingZero(scaled.toFixed(maxFractionDigits)) + u.suffix;
      }
    }

    return sign + abs.toString();
  }

  private stripTrailingZero(s: string): string {
    // "1.20" -> "1.2", "5.0" -> "5"
    if (!s.includes('.')) return s;
    return s.replace(/\.?0+$/, '');
  }
}
