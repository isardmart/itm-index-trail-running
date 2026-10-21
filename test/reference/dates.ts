// Dates "de calendari" (YYYY-MM-DD) sense zona horària. Tots els càlculs
// es fan en UTC perquè un dia d'entrenament és sempre el mateix dia,
// independentment d'on s'executi el servidor.

export type DateOnly = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): value is DateOnly {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: DateOnly): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): DateOnly {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Dilluns de la setmana ISO que conté la data. */
export function weekStart(date: DateOnly): DateOnly {
  const d = toUtc(date);
  const weekday = (d.getUTCDay() + 6) % 7; // 0 = dilluns
  d.setUTCDate(d.getUTCDate() - weekday);
  return fromUtc(d);
}

export function monthStart(date: DateOnly): DateOnly {
  return `${date.slice(0, 7)}-01`;
}

/** Llista de dilluns, de més antic a més recent, acabant a la setmana de `until`. */
export function lastWeeks(until: DateOnly, count: number): DateOnly[] {
  const last = weekStart(until);
  return Array.from({ length: count }, (_, i) => addDays(last, (i - count + 1) * 7));
}

/** Data d'avui a la zona horària indicada (per defecte, la del projecte). */
export function today(timeZone = "Europe/Madrid", now: Date = new Date()): DateOnly {
  // en-CA formata com a YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
