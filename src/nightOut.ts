/**
 * Night runs and nights out (bivouac, hut, multi-day route) from Strava-like activities: local start time, total
 * time, title and description, and where each activity starts and ends. Only the yes/no result is meant to be
 * published, never the description or the coordinates.
 */

export type TimedActivity = {
  id: number;
  name: string;
  description?: string | null;
  /** "2026-10-03T07:00:00Z" (Strava gives local time with a "Z" that is not UTC). */
  start_date_local: string;
  /** Total time in seconds, stops included. */
  elapsed_time: number;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
};

const minutesOfDay = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** Whether any part of the activity falls between 22:00 and 05:00 local time. */
export function isNightRun(startLocal: string, elapsedS: number): boolean {
  const start = minutesOfDay(startLocal);
  const end = start + Math.round(elapsedS / 60);
  if (start < 5 * 60 || start >= 22 * 60) return true;
  return end > 22 * 60;
}

/** Whether the activity goes through the small hours (02:00) from one day to the next. */
function overnight(startLocal: string, elapsedS: number): boolean {
  const start = minutesOfDay(startLocal);
  const end = start + elapsedS / 60;
  return end >= 24 * 60 + 2 * 60 || (start < 2 * 60 && end >= 2 * 60);
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Words that mean sleeping out, in Catalan, Spanish, French and English (after removing accents). */
const SLEEP_WORDS =
  /\b(dormir|dormint|dormit|dormim|vaig dormir|dormida|vivac|bivac|bivouac|bivy|refugi|refugio|acampada|acampar|tenda|tienda|sleep|slept|sleeping|camping|nit fora|noche fuera)\b/;

/** Total time (hours) from which an activity with sleeping words counts as a night out. */
export const SLEEP_MIN_HOURS = 10;

function km(a: [number, number], b: [number, number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const addDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Ids of the activities that include a night out:
 *  - the title or description mentions sleeping (dormir, bivac, refugi, acampada, sleep, camping…) and the activity
 *    lasts ≥ 10 h in total or goes through 02:00;
 *  - or it is day one of a two-day route: it goes from one place to another (ends ≥ 5 km from its start), ends after
 *    15:00, and the next day an activity starts by 11:00 within 3 km of where it ended. A loop from home does not
 *    count, even if the next day starts from home again.
 */
export function sleptOutIds(acts: readonly TimedActivity[]): Set<number> {
  const out = new Set<number>();
  for (const a of acts) {
    const text = fold(`${a.name} ${a.description ?? ""}`);
    if (!SLEEP_WORDS.test(text)) continue;
    if (a.elapsed_time >= SLEEP_MIN_HOURS * 3600 || overnight(a.start_date_local, a.elapsed_time)) out.add(a.id);
  }
  const sorted = [...acts].sort((x, y) => x.start_date_local.localeCompare(y.start_date_local));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    if (!a.end_latlng || !a.start_latlng || km(a.start_latlng, a.end_latlng) < 5) continue;
    const endMin = minutesOfDay(a.start_date_local) + a.elapsed_time / 60;
    if (endMin < 15 * 60) continue;
    const nextDay = addDay(a.start_date_local.slice(0, 10));
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      const day = b.start_date_local.slice(0, 10);
      if (day > nextDay) break;
      if (day !== nextDay || !b.start_latlng) continue;
      if (minutesOfDay(b.start_date_local) <= 11 * 60 && km(a.end_latlng, b.start_latlng) <= 3) out.add(a.id);
    }
  }
  return out;
}
