import type { ActivityRow, ActivityType } from "./database.types";
import { stravaCategory, type CalendarCategory, type StravaSummaryActivity } from "./activityCalendar";
import type { DateOnly } from "./dates";
import { isNightRun } from "./nightOut";

/** Les activitats d'Strava s'importen des que va començar el trail running (cap a maig de 2025). */
export const STRAVA_IMPORT_FROM: DateOnly = "2025-05-01";

const TYPE_BY_CATEGORY: Record<CalendarCategory, ActivityType> = {
  trail: "trail_run",
  run: "run",
  hike: "hike",
  ride: "other",
  swim: "swim",
  strength: "strength",
  mobility: "mobility",
  other: "other",
};

/**
 * Només s'importen les modalitats que compten per al camí: trail, córrer,
 * natació (piscina) i força/mobilitat (necessària per al mínim setmanal).
 * Bicicleta, caminades i la resta no entren.
 */
export const IMPORT_CATEGORIES: ReadonlySet<CalendarCategory> = new Set([
  "trail",
  "run",
  "swim",
  "strength",
  "mobility",
]);

export type StravaImportRow = Pick<
  ActivityRow,
  | "strava_id"
  | "type"
  | "status"
  | "date"
  | "title"
  | "duration_s"
  | "distance_m"
  | "elevation_gain_m"
  | "visibility"
  | "route_polyline"
  | "place"
  | "calories"
  | "start_time"
  | "elapsed_s"
  | "night"
  | "slept_out"
  | "altitude_m"
>;

/** Altitud d'una sortida: el punt mig entre el més baix i el més alt (Strava no dona la de sortida al resum). */
export function stravaAltitude(a: Pick<StravaSummaryActivity, "elev_high" | "elev_low">): number | null {
  const { elev_high: high, elev_low: low } = a;
  if (typeof high !== "number" || typeof low !== "number" || !Number.isFinite(high) || !Number.isFinite(low))
    return null;
  return Math.round(Math.min(9000, Math.max(-500, (high + low) / 2)));
}

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v)));

/**
 * Converteix una activitat d'Strava a una fila d'activitat. És pública si a Strava la veu tothom o
 * els seguidors (aquesta web és la meva: els seguidors ja la poden veure); només «només jo» queda privada.
 */
export function fromStrava(a: StravaSummaryActivity): StravaImportRow {
  const isPublic = a.private !== true && ["everyone", "followers_only"].includes(a.visibility ?? "everyone");
  return {
    strava_id: a.id,
    type: TYPE_BY_CATEGORY[stravaCategory(a.type, a.sport_type)],
    status: "completed",
    date: a.start_date_local.slice(0, 10),
    title: a.name.trim().slice(0, 160),
    duration_s: clamp(a.moving_time, 604_800),
    distance_m: clamp(a.distance, 1_000_000),
    elevation_gain_m: clamp(a.total_elevation_gain, 30_000),
    visibility: isPublic ? "public" : "private",
    route_polyline: a.map?.summary_polyline || null,
    place: null,
    calories: null,
    start_time: a.start_date_local.slice(11, 16),
    elapsed_s: Math.round(a.elapsed_time ?? a.moving_time),
    night: isNightRun(a.start_date_local, a.elapsed_time ?? a.moving_time),
    slept_out: false,
    altitude_m: stravaAltitude(a),
  };
}

/** Activitats a importar: des de la data d'inici, una per identificador. */
export function selectForImport(raw: StravaSummaryActivity[], from: DateOnly = STRAVA_IMPORT_FROM): StravaImportRow[] {
  const byId = new Map<number, StravaImportRow>();
  for (const a of raw) {
    if (a.start_date_local.slice(0, 10) < from) continue;
    if (!IMPORT_CATEGORIES.has(stravaCategory(a.type, a.sport_type))) continue;
    byId.set(a.id, fromStrava(a));
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Posició d'inici de cada activitat d'Strava (per id), si en té. */
export function startPoints(raw: StravaSummaryActivity[]): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const a of raw) {
    const p = a.start_latlng;
    if (p && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.set(a.id, [p[0], p[1]]);
  }
  return out;
}

export type RaceMilestone = {
  id: string;
  kind: string;
  status: string;
  completed_on: string | null;
  distance_km: number | null;
  elevation_gain_m: number | null;
  result_time_s: number | null;
};

export type ImportedActivity = {
  id: string;
  type: string;
  date: string;
  distance_m: number | null;
  elevation_gain_m: number | null;
  duration_s: number | null;
  milestone_id: string | null;
};

/**
 * Enllaça les activitats d'Strava amb les curses completades el mateix dia: la
 * sortida més llarga de córrer d'aquell dia (si és prou llarga per ser la
 * cursa) passa a ser l'activitat de la cursa i omple el desnivell, la
 * distància i el temps de la fita si encara no els tenia.
 */
export function linkRaces(
  activities: ImportedActivity[],
  milestones: RaceMilestone[],
): {
  activityId: string;
  milestoneId: string;
  fill: { distance_km?: number; elevation_gain_m?: number; result_time_s?: number };
}[] {
  const out: ReturnType<typeof linkRaces> = [];
  for (const m of milestones) {
    if (m.kind !== "race" || m.status !== "completed" || !m.completed_on) continue;
    const minM = (m.distance_km ?? 15) * 1000 * 0.7;
    const best = activities
      .filter(
        (a) => a.date === m.completed_on && (a.type === "run" || a.type === "trail_run") && (a.distance_m ?? 0) >= minM,
      )
      .sort((a, b) => (b.distance_m ?? 0) - (a.distance_m ?? 0))[0];
    if (!best || (best.milestone_id && best.milestone_id !== m.id)) continue;
    const fill: { distance_km?: number; elevation_gain_m?: number; result_time_s?: number } = {};
    if (m.distance_km == null && best.distance_m) fill.distance_km = Math.round(best.distance_m / 100) / 10;
    if (m.elevation_gain_m == null && best.elevation_gain_m != null) fill.elevation_gain_m = best.elevation_gain_m;
    if (m.result_time_s == null && best.duration_s) fill.result_time_s = best.duration_s;
    out.push({ activityId: best.id, milestoneId: m.id, fill });
  }
  return out;
}
