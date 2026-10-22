import { DEFAULT_ITM_CONFIG, mergeItmConfig, type ItmConfig, type ItmConfigPatch, type ItmKey } from "./config";
import type { DateOnly } from "./dates";
import { kmEffort } from "./effort";
import {
  altitudeStayCut,
  altitudeTrainingBonus,
  categoryWith,
  eventsWith,
  itmDeltas,
  itmOn,
  makeEngine,
  nextLevelFor,
  qualifyingWith,
  shortRunWith,
  simulateWith,
  type ItmEvent,
  type SimulateOptions,
} from "./engine";
import type { ItmLevel } from "./levels";
import { resolveLocale, type ItmLocale, type LocaleInput } from "./locales";
import type { AthleteProfile, ModifierUse } from "./modifiers/types";
import {
  raceKey,
  readinessMetrics,
  readinessWith,
  readyWith,
  type Readiness,
  type ReadinessInput,
  type ReadinessMetrics,
} from "./readiness";
import type { AltitudeStay, ItmActivity, ItmDay } from "./types";
import { nextZone, zoneForItm, zones as zonesOf, type Zone } from "./zones";

export type CreateItmOptions = {
  /** Full config (default `DEFAULT_ITM_CONFIG`). Validated: an invalid one throws `ItmConfigError`. */
  config?: Readonly<ItmConfig> | undefined;
  /**
   * Partial patch applied on top of `config` (e.g. what `diffFromDefault` stored). Kept separate from `config` on
   * purpose: in a patch a missing field means "unchanged", in a full config it means "absent".
   */
  patch?: ItmConfigPatch | null | undefined;
  /** "en" (default), "ca", or a custom `ItmLocale`. */
  locale?: LocaleInput | undefined;
  /** Community variables (all off unless listed). */
  modifiers?: readonly ModifierUse[] | undefined;
  /** Local-only athlete data for the modifiers. */
  athlete?: AthleteProfile | undefined;
};

type EffortInput = Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m">;

export type Itm = {
  readonly config: Readonly<ItmConfig>;
  readonly locale: ItmLocale;
  /** Levels with labels, colours, thresholds and derived weekly km effort. */
  readonly levels: readonly ItmLevel[];
  /** Mountain bands (presentation only). */
  readonly zones: readonly Zone[];
  kmEffort: typeof kmEffort;
  simulateItm: (
    activities: readonly ItmActivity[],
    until: DateOnly,
    options?: Pick<SimulateOptions, "baseline" | "stays">,
  ) => ItmDay[];
  itmOn: typeof itmOn;
  itmDeltas: typeof itmDeltas;
  itmEvents: (series: readonly ItmDay[], activities: readonly ItmActivity[]) => ItmEvent[];
  /** Next level and ITM missing; with modifiers, `date` selects the day's (scaled) thresholds. */
  nextItmLevel: (itm: number, date?: DateOnly) => { level: ItmLevel; missing: number } | null;
  sessionCategory: (effort: number) => ItmLevel | null;
  qualifyingEffort: (a: EffortInput) => number | null;
  shortRunEffort: (a: EffortInput) => number | null;
  countedEffort: (a: EffortInput) => number | null;
  altitudeTrainingBonus: (altitude: number | null | undefined) => number;
  altitudeStayCut: (date: DateOnly, stays: readonly AltitudeStay[]) => number;
  readinessMetrics: (input: ReadinessInput, date: DateOnly) => ReadinessMetrics;
  readinessFor: (key: ItmKey, date: DateOnly, itm: number, input: ReadinessInput) => Readiness;
  readyFor: (date: DateOnly, itm: number, input: ReadinessInput) => ItmLevel | null;
  raceKey: (effort: number) => ItmKey | null;
  zoneForItm: (itm: number) => Zone;
  nextZone: (zone: Zone) => Zone | null;
};

/**
 * An ITM bound to one config, locale, set of modifiers and athlete. Pure: it keeps no state between calls, and two
 * instances never affect each other.
 *
 * ```ts
 * const itm = createItm({ patch: { altitudeFrom: 1000 }, locale: "ca" });
 * const series = itm.simulateItm(activities, "2026-10-21", { baseline: { date: "2025-05-01", itm: 0 } });
 * ```
 */
export function createItm(options: CreateItmOptions = {}): Itm {
  const config = mergeItmConfig(options.config ?? DEFAULT_ITM_CONFIG, options.patch);
  const e = makeEngine({ config, modifiers: options.modifiers, athlete: options.athlete });
  const locale = resolveLocale(options.locale);
  const bands = Object.freeze(zonesOf(config, locale).map((z) => Object.freeze(z)));
  const zoneList = bands as Zone[];
  return Object.freeze({
    config,
    locale,
    levels: e.levels,
    zones: bands,
    kmEffort,
    simulateItm: (activities, until, o = {}) => simulateWith(e, activities, until, o.baseline, o.stays),
    itmOn,
    itmDeltas,
    itmEvents: (series, activities) => eventsWith(e, series, activities, locale),
    nextItmLevel: (itm, date) => nextLevelFor(e, itm, date),
    sessionCategory: (effort) => categoryWith(e, effort),
    qualifyingEffort: (a) => qualifyingWith(e, a),
    shortRunEffort: (a) => shortRunWith(e, a),
    countedEffort: (a) => qualifyingWith(e, a) ?? shortRunWith(e, a),
    altitudeTrainingBonus: (altitude) => altitudeTrainingBonus(altitude, config),
    altitudeStayCut: (date, stays) => altitudeStayCut(date, stays, config, e.homeAltitude),
    readinessMetrics,
    readinessFor: (key, date, itm, input) => readinessWith(e, key, date, itm, input, locale),
    readyFor: (date, itm, input) => readyWith(e, date, itm, input, locale),
    raceKey: (effort) => raceKey(effort, config),
    zoneForItm: (itm) => zoneForItm(itm, zoneList),
    nextZone: (zone) => nextZone(zone, zoneList),
  } satisfies Itm);
}
