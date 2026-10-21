// Minimal stand-in for ultra_trail_run's src/lib/supabase/database.types.ts: only the types the vendored domain
// files import. Copied verbatim where present; DB-only columns are typed loosely because the engine never reads them.
export type ActivityType = "run" | "trail_run" | "hike" | "strength" | "swim" | "mobility" | "rest" | "other";
export type ActivityStatus = "planned" | "completed" | "skipped";
export type Visibility = "public" | "private";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  date: string;
  title: string;
  duration_s: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  strava_id: number | null;
  route_polyline: string | null;
  place: string | null;
  calories: number | null;
  start_time: string | null;
  elapsed_s: number | null;
  night: boolean;
  slept_out: boolean;
  altitude_m: number | null;
  visibility: Visibility;
};

export type MilestoneRow = {
  kind: "race" | "skill" | "destination" | string;
  status: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  level: "20k" | "50k" | "100k" | "100m" | "utmb" | null;
};
