import type { DateOnly } from "./dates";

export type ActivityType = "run" | "trail_run" | "hike" | "strength" | "swim" | "mobility" | "rest" | "other";

export type ItmActivity = {
  /** Local date of the activity. */
  date: DateOnly;
  type: ActivityType;
  distance_m: number | null;
  elevation_gain_m: number | null;
  /** Altitude of the activity (m), if known. From Strava: (elev_high + elev_low) / 2, see `stravaAltitude`. */
  altitude_m?: number | null;
  /** Optional, for modifiers only: load carried (kg), e.g. a mandatory-kit pack. Never read by the core. */
  carriedLoadKg?: number | null;
  /** Optional, for modifiers only: mean air temperature (°C) during the activity. Never read by the core. */
  temperatureC?: number | null;
};

/** Consecutive nights slept at altitude (a stay in the mountains). Outside these days, the athlete is home. */
export type AltitudeStay = { start: DateOnly; end: DateOnly; altitude_m: number };

/** Where the series starts: the date the athlete started trail running and their ITM then (usually 0). */
export type ItmBaseline = { date: DateOnly; itm: number };

/** 0 = no level yet; 1 = 20K, 2 = 50K, 3 = 100K, 4 = 100M, 5 = UTMB. */
export type LevelIndex = 0 | 1 | 2 | 3 | 4 | 5;

export type ItmDay = {
  date: DateOnly;
  /** ITM at the end of the day, rounded to 2 decimals. */
  itm: number;
  /** 0 = no level yet; 1 = 20K … 5 = UTMB (with cushion). */
  level: LevelIndex;
  /** ITM added by the day's sessions (not rounded). */
  gain: number;
  /** ITM lost to decay that day, rounded to 2 decimals. */
  decay: number;
};
