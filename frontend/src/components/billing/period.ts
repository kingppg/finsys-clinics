// ============================================================================
// PERIOD — date-range helpers for the Billing period picker.
// All-time / Annual / Monthly / Weekly / Daily. Pure, no dependencies.
// A range is [start, end) in local time; `all` uses null bounds (matches
// everything). Filtering is done client-side on rows already loaded.
// ============================================================================

export type Gran = 'all' | 'year' | 'month' | 'week' | 'day';

export const GRANS: { key: Gran; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'Annual' },
  { key: 'month', label: 'Monthly' },
  { key: 'week', label: 'Weekly' },
  { key: 'day', label: 'Daily' },
];

export interface PeriodRange {
  start: Date | null;
  end: Date | null; // exclusive
  label: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Compute the [start, end) range + a human label for a granularity + anchor. */
export function getPeriodRange(gran: Gran, anchor: Date, locale?: string): PeriodRange {
  const a = startOfDay(anchor);

  if (gran === 'all') return { start: null, end: null, label: 'All time' };

  if (gran === 'year') {
    const start = new Date(a.getFullYear(), 0, 1);
    const end = new Date(a.getFullYear() + 1, 0, 1);
    return { start, end, label: String(a.getFullYear()) };
  }

  if (gran === 'month') {
    const start = new Date(a.getFullYear(), a.getMonth(), 1);
    const end = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { start, end, label: start.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) };
  }

  if (gran === 'week') {
    // Monday-based week.
    const dow = (a.getDay() + 6) % 7; // Mon=0 … Sun=6
    const start = new Date(a);
    start.setDate(a.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const lastDay = new Date(end);
    lastDay.setDate(end.getDate() - 1);
    const label = `${start.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} – ${lastDay.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return { start, end, label };
  }

  // day
  const end = new Date(a);
  end.setDate(a.getDate() + 1);
  return { start: a, end, label: a.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' }) };
}

/** Shift the anchor by one period in the given direction (-1 / +1). */
export function shiftAnchor(gran: Gran, anchor: Date, dir: number): Date {
  const a = new Date(anchor);
  if (gran === 'year') a.setFullYear(a.getFullYear() + dir);
  else if (gran === 'month') a.setMonth(a.getMonth() + dir);
  else if (gran === 'week') a.setDate(a.getDate() + 7 * dir);
  else if (gran === 'day') a.setDate(a.getDate() + dir);
  return a;
}

/** Is a date string within the range? Falls back to a secondary date (created_at). */
export function inRange(dateStr: string | null | undefined, r: PeriodRange, fallback?: string | null): boolean {
  if (!r.start || !r.end) return true; // all time
  const d = parseDay(dateStr) || parseDay(fallback);
  if (!d) return false;
  return d >= r.start && d < r.end;
}

/** True when the range already reaches "now" — used to disable the Next arrow. */
export function isCurrentOrFuture(r: PeriodRange, now: Date = new Date()): boolean {
  return !r.end || now < r.end;
}
