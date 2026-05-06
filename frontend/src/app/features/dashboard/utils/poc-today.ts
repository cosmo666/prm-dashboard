import { environment } from 'src/environments/environment';

/**
 * Anchor used by `resolvePreset`. In dev = '2026-03-31' (POC seed-data range);
 * in production = '' which falls back to real today via `new Date()`. Extracted
 * to its own module so tests can stub it.
 *
 * `pocToday` is parsed as a local-date YMD triple — `new Date('2026-03-31')`
 * would interpret it as UTC midnight, which then displays as 2026-03-30 in any
 * non-UTC timezone.
 */
function parsePocToday(iso: string): Date {
  const parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export const POC_TODAY: Date = environment.pocToday
  ? parsePocToday(environment.pocToday)
  : new Date();
