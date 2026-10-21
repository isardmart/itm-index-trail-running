import { addDays, weekStart, type ActivityType, type AltitudeStay, type ItmActivity, type ItmKey } from "../src/index";
import type { ReadinessInput } from "../src/index";
import type { TimedActivity } from "../src/index";

/** Small, fast, seedable PRNG (mulberry32). Same seed → same history, on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const chance = (p: number) => next() < p;
  return { next, int, pick, chance };
}

export type Rng = ReturnType<typeof rng>;

export type GeneratedHistory = {
  activities: ItmActivity[];
  stays: AltitudeStay[];
  baseline: { date: string; itm: number };
  until: string;
  readiness: ReadinessInput;
  sampleDates: string[];
};

const SUPPORT: ActivityType[] = ["strength", "mobility", "swim", "hike", "other", "rest"];

function runDistanceKm(r: Rng): number {
  const p = r.next();
  if (p < 0.55) return 2 + r.next() * 10; // short
  if (p < 0.85) return 12 + r.next() * 18; // medium
  if (p < 0.97) return 30 + r.next() * 50; // long
  return 100 + r.next() * 80; // ultra
}

/** A random but plausible history: rest days, same-day doubles, support sessions, altitude, stays, races. */
export function generateHistory(seed: number): GeneratedHistory {
  const r = rng(seed);
  const start = addDays("2024-01-01", r.int(0, 900));
  const days = r.int(30, 650);
  const activities: ItmActivity[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    if (r.chance(0.4)) continue; // rest day, nothing logged
    const n = r.chance(0.15) ? r.int(2, 3) : 1;
    for (let k = 0; k < n; k++) {
      if (r.chance(0.65)) {
        const km = runDistanceKm(r);
        const a: ItmActivity = {
          date,
          type: r.chance(0.7) ? "trail_run" : "run",
          distance_m: r.chance(0.03) ? null : Math.round(km * 1000),
          elevation_gain_m: r.chance(0.05) ? null : Math.round(km * r.next() * 90),
        };
        if (r.chance(0.5)) a.altitude_m = r.chance(0.1) ? null : r.int(-50, 4800);
        activities.push(a);
      } else {
        const type = r.pick(SUPPORT);
        activities.push({
          date,
          type,
          distance_m: type === "swim" || type === "hike" ? r.int(0, 15000) : r.chance(0.5) ? null : 0,
          elevation_gain_m: type === "hike" ? r.int(0, 1500) : null,
        });
      }
    }
  }
  // Shuffle a little: the engine must not depend on input order across days.
  for (let i = activities.length - 1; i > 0 && r.chance(0.5); i--) {
    const j = r.int(0, i);
    [activities[i], activities[j]] = [activities[j]!, activities[i]!];
  }
  const stays: AltitudeStay[] = [];
  for (let s = r.int(0, 4); s > 0; s--) {
    const from = addDays(start, r.int(0, days));
    stays.push({ start: from, end: addDays(from, r.int(0, 14)), altitude_m: r.int(300, 3800) });
  }
  const baseline = {
    date: addDays(start, r.chance(0.3) ? r.int(-60, 0) : r.int(0, 120)),
    itm: r.chance(0.5) ? 0 : Math.round(r.next() * 900 * 100) / 100,
  };
  const until = addDays(start, days + r.int(0, 60));

  const runs = activities.filter((a) => a.type === "run" || a.type === "trail_run");
  const readiness: ReadinessInput = {
    sessions: runs.map((a) => ({
      date: a.date,
      effort: (a.distance_m ?? 0) / 1000 + (a.elevation_gain_m ?? 0) / 100,
      night: r.chance(0.08),
      sleptOut: r.chance(0.03),
    })),
    supportWeeks: [],
    races: [],
  };
  for (let w = 0; w < days / 7; w++)
    if (r.chance(0.6)) readiness.supportWeeks.push({ week: weekStart(addDays(start, w * 7)), count: r.int(0, 4) });
  const keys: ItmKey[] = ["20k", "50k", "100k", "100m", "utmb"];
  for (let k = r.int(0, 4); k > 0; k--)
    readiness.races.push({ date: addDays(start, r.int(0, days)), key: r.pick(keys) });

  const sampleDates = Array.from({ length: 12 }, () => addDays(start, r.int(-10, days + 70)));
  return { activities, stays, baseline, until, readiness, sampleDates };
}

/** Random Strava-like timed activities for the night-out detectors. */
export function generateTimed(seed: number): TimedActivity[] {
  const r = rng(seed);
  const names = ["Sortida", "Bivac al Cadí", "Dormint al refugi", "Long run", "Acampada", "Camping trip", "Volta"];
  const out: TimedActivity[] = [];
  let day = addDays("2025-06-01", r.int(0, 30));
  for (let id = 1; id <= r.int(3, 25); id++) {
    day = addDays(day, r.int(0, 2));
    const hh = String(r.int(0, 23)).padStart(2, "0");
    const mm = String(r.int(0, 59)).padStart(2, "0");
    const lat = 42 + r.next();
    const lng = 1 + r.next();
    out.push({
      id,
      name: r.pick(names),
      description: r.chance(0.2) ? "Vam dormir a la tenda" : null,
      start_date_local: `${day}T${hh}:${mm}:00Z`,
      elapsed_time: r.int(600, 30 * 3600),
      start_latlng: r.chance(0.8) ? [lat, lng] : null,
      end_latlng: r.chance(0.8) ? [lat + (r.next() - 0.5) * 0.2, lng + (r.next() - 0.5) * 0.2] : null,
    });
  }
  return out;
}
