import { toDateOnly } from "./dates";
import type { ActivityType, ItmActivity } from "./types";

/** The fields of a Strava "summary activity" this package reads. */
export type StravaSummaryActivity = {
  type: string;
  sport_type?: string | undefined;
  start_date_local: string;
  distance: number;
  total_elevation_gain: number;
  /** Highest and lowest points (m) of the activity. */
  elev_high?: number | null | undefined;
  elev_low?: number | null | undefined;
};

export type StravaCategory = "trail" | "run" | "hike" | "ride" | "swim" | "strength" | "mobility" | "other";

/** Category of a Strava activity from its `sport_type` (or legacy `type`). */
export function stravaCategory(type: string, sportType?: string): StravaCategory {
  const v = (sportType || type || "").toLowerCase();
  if (v.includes("trail")) return "trail";
  if (v.includes("run")) return "run";
  if (v.includes("hike") || v.includes("walk") || v.includes("snowshoe")) return "hike";
  if (v.includes("ride") || v.includes("bike") || v.includes("cycl")) return "ride";
  if (v.includes("swim")) return "swim";
  if (v.includes("weight") || v.includes("crossfit") || v.includes("workout") || v.includes("hiit")) return "strength";
  if (v.includes("yoga") || v.includes("pilates") || v.includes("stretch")) return "mobility";
  return "other";
}

const TYPE_BY_CATEGORY: Record<StravaCategory, ActivityType> = {
  trail: "trail_run",
  run: "run",
  hike: "hike",
  ride: "other",
  swim: "swim",
  strength: "strength",
  mobility: "mobility",
  other: "other",
};

/** Categories isardtrail.com imports: running, swimming and strength/mobility. Rides, hikes and the rest are not. */
export const IMPORTED_STRAVA_CATEGORIES: ReadonlySet<StravaCategory> = new Set([
  "trail",
  "run",
  "swim",
  "strength",
  "mobility",
]);

/** Altitude of an activity: the midpoint between its lowest and highest points, clamped to −500..9000 m. */
export function stravaAltitude(a: Pick<StravaSummaryActivity, "elev_high" | "elev_low">): number | null {
  const { elev_high: high, elev_low: low } = a;
  if (typeof high !== "number" || typeof low !== "number" || !Number.isFinite(high) || !Number.isFinite(low))
    return null;
  return Math.round(Math.min(9000, Math.max(-500, (high + low) / 2)));
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));

export type FromStravaOptions = {
  /**
   * Also map categories isardtrail.com does not import (rides and others become `other`, a support session; hikes
   * become `hike`). Default false: they return null, as on the site.
   */
  includeAllCategories?: boolean | undefined;
};

/** Converts a Strava summary activity to an ITM activity (or null for categories that are not imported). */
export function fromStravaActivity(a: StravaSummaryActivity, options: FromStravaOptions = {}): ItmActivity | null {
  const category = stravaCategory(a.type, a.sport_type);
  if (!options.includeAllCategories && !IMPORTED_STRAVA_CATEGORIES.has(category)) return null;
  return {
    date: toDateOnly(a.start_date_local.slice(0, 10)),
    type: TYPE_BY_CATEGORY[category],
    distance_m: clamp(a.distance, 1_000_000),
    elevation_gain_m: clamp(a.total_elevation_gain, 30_000),
    altitude_m: stravaAltitude(a),
  };
}
