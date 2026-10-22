/**
 * Calendar dates as `"YYYY-MM-DD"` strings, with no time zone. Every computation runs in UTC so that a training day
 * is always the same day, wherever the code runs.
 */
export type DateOnly = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a string is a real calendar date in `YYYY-MM-DD` form. */
export function isDateOnly(value: string): value is DateOnly {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const toUtc = (date: DateOnly): Date => new Date(`${date}T00:00:00Z`);
const fromUtc = (d: Date): DateOnly => d.toISOString().slice(0, 10);

/** `date` plus `days` calendar days (negative to go back). */
export function addDays(date: DateOnly, days: number): DateOnly {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Monday of the ISO week that contains the date. */
export function weekStart(date: DateOnly): DateOnly {
  const d = toUtc(date);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - weekday);
  return fromUtc(d);
}
