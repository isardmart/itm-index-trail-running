import { addDays, weekStart, type DateOnly } from "./dates";

/**
 * Calendari d'activitat (estil "mapa de calor") a partir de les activitats
 * d'Strava. Lògica pura: filtra per privadesa, redueix les dades al mínim
 * publicable i construeix la graella setmanal.
 */

/** Camps d'una activitat d'Strava que fem servir (API v3, SummaryActivity). */
export type StravaSummaryActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  private?: boolean;
  visibility?: string;
  map?: { summary_polyline?: string | null } | null;
  start_latlng?: [number, number] | null;
  end_latlng?: [number, number] | null;
  elapsed_time?: number;
  /** Punts més alt i més baix (m) de la sortida. */
  elev_high?: number | null;
  elev_low?: number | null;
  /** Fotos pujades a l'activitat (Strava i Instagram). */
  total_photo_count?: number;
};

export type CalendarCategory = "trail" | "run" | "hike" | "ride" | "swim" | "strength" | "mobility" | "other";

export const CALENDAR_CATEGORY_LABELS: Record<CalendarCategory, string> = {
  trail: "Trail",
  run: "Running",
  hike: "Caminada",
  ride: "Bicicleta",
  swim: "Natació",
  strength: "Força",
  mobility: "Mobilitat",
  other: "Altres",
};

/** Dades mínimes publicables d'una activitat. */
export type CalendarActivity = {
  date: DateOnly;
  category: CalendarCategory;
  name: string;
  distanceM: number;
  elevationGainM: number;
  movingTimeS: number;
};

export function stravaCategory(type: string, sportType?: string): CalendarCategory {
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

/**
 * Només les activitats visibles per a tothom a Strava. Les privades, les de
 * "només jo" i les de "només seguidors" no surten mai de la web.
 */
export function toPublicActivities(raw: StravaSummaryActivity[]): CalendarActivity[] {
  return raw
    .filter((a) => a.private !== true && (a.visibility ?? "everyone") === "everyone")
    .map((a) => ({
      date: a.start_date_local.slice(0, 10),
      category: stravaCategory(a.type, a.sport_type),
      name: a.name,
      distanceM: Math.round(a.distance),
      elevationGainM: Math.round(a.total_elevation_gain),
      movingTimeS: a.moving_time,
    }));
}

export type CalendarDay = {
  date: DateOnly;
  activities: CalendarActivity[];
  movingTimeS: number;
  distanceM: number;
  elevationGainM: number;
  /** 0 = res, 1–4 = temps en moviment creixent. */
  level: 0 | 1 | 2 | 3 | 4;
};

/** Llindars de nivell per temps en moviment (minuts). */
export const LEVEL_THRESHOLDS_MIN = [45, 90, 180] as const;

function levelFor(movingTimeS: number): CalendarDay["level"] {
  if (movingTimeS <= 0) return 0;
  const min = movingTimeS / 60;
  if (min < LEVEL_THRESHOLDS_MIN[0]) return 1;
  if (min < LEVEL_THRESHOLDS_MIN[1]) return 2;
  if (min < LEVEL_THRESHOLDS_MIN[2]) return 3;
  return 4;
}

export type ActivityCalendarData = {
  until: DateOnly;
  /** Setmanes (dilluns → diumenge), de més antiga a més recent. Els dies futurs són null. */
  weeks: (CalendarDay | null)[][];
  totals: { activities: number; distanceM: number; elevationGainM: number; movingTimeS: number; activeWeeks: number };
};

export function buildCalendar(activities: CalendarActivity[], until: DateOnly, weekCount = 53): ActivityCalendarData {
  const firstMonday = addDays(weekStart(until), -7 * (weekCount - 1));
  const byDate = new Map<DateOnly, CalendarActivity[]>();
  for (const a of activities) {
    if (a.date < firstMonday || a.date > until) continue;
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  }

  const totals = { activities: 0, distanceM: 0, elevationGainM: 0, movingTimeS: 0, activeWeeks: 0 };
  const weeks: (CalendarDay | null)[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: (CalendarDay | null)[] = [];
    let active = false;
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstMonday, w * 7 + d);
      if (date > until) {
        week.push(null);
        continue;
      }
      const items = byDate.get(date) ?? [];
      const day: CalendarDay = {
        date,
        activities: items,
        movingTimeS: items.reduce((s, a) => s + a.movingTimeS, 0),
        distanceM: items.reduce((s, a) => s + a.distanceM, 0),
        elevationGainM: items.reduce((s, a) => s + a.elevationGainM, 0),
        level: 0,
      };
      day.level = levelFor(day.movingTimeS);
      if (items.length > 0) active = true;
      totals.activities += items.length;
      totals.distanceM += day.distanceM;
      totals.elevationGainM += day.elevationGainM;
      totals.movingTimeS += day.movingTimeS;
      week.push(day);
    }
    if (active) totals.activeWeeks += 1;
    weeks.push(week);
  }
  return { until, weeks, totals };
}
