import type { ItmKey } from "../config";
import type { DateOnly } from "../dates";
import type { ReadinessMetrics } from "../readiness";
import type { ItmActivity } from "../types";

/** Static athlete fields a modifier may declare as inputs. `age` is derived from `birthDate` (or given directly). */
export type AthleteField = "age" | "sex" | "bodyMassKg" | "restingHr" | "maxHr" | "vo2max" | "homeAltitude";

/** Dated series a modifier may declare as inputs (raw body mass is never one of them, see `AthleteView`). */
export type SeriesKey = "restingHr" | "sleepHours" | "hrvRmssd";

/** Dated series an athlete profile may hold: the modifier series plus body mass. */
export type ProfileSeriesKey = SeriesKey | "bodyMassKg";

/** Per-activity fields a modifier may declare as inputs (only meaningful for `effortMultiplier`). */
export type ActivityField = "altitude_m" | "carriedLoadKg" | "temperatureC";

export type DatedValue = { date: DateOnly; value: number };

/**
 * Optional, local-only description of the athlete. Every field is optional: without it, any modifier that needs it
 * is a no-op. The core ITM never reads it (except `homeAltitude`, which replaces `config.homeAltitude` when set).
 */
export type AthleteProfile = {
  birthDate?: DateOnly;
  /** Used only when `birthDate` is missing; then it is treated as constant over the whole history. */
  age?: number;
  sex?: "female" | "male";
  bodyMassKg?: number;
  restingHr?: number;
  maxHr?: number;
  vo2max?: number;
  homeAltitude?: number;
  series?: Partial<Record<ProfileSeriesKey, readonly DatedValue[]>>;
};

export type InputSpec =
  | { source: "athlete"; field: AthleteField; required?: boolean; description: string }
  | { source: "series"; field: SeriesKey; required?: boolean; description: string }
  | { source: "activity"; field: ActivityField; required?: boolean; description: string };

export type ParamSpec = {
  default: number;
  min: number;
  max: number;
  description: string;
  unit?: string;
};

/** Causal read-only access to the dated series: nothing after the current day is ever visible. */
export type SeriesView = {
  /** Most recent value on or before the current day (optionally no older than `maxAgeDays`). */
  latest(key: SeriesKey, maxAgeDays?: number): number | undefined;
  /** Values of the last `days` days, up to and including the current day, oldest first. */
  window(key: SeriesKey, days: number): number[];
};

/**
 * What a hook sees of the athlete on a given day: only the fields its modifier declared in `inputs`, `age` at that
 * day, and `bodyMassKg` as the highest value known so far (so losing weight can never change anything).
 */
export type AthleteView = Readonly<{
  age?: number;
  sex?: "female" | "male";
  bodyMassKg?: number;
  restingHr?: number;
  maxHr?: number;
  vo2max?: number;
  homeAltitude?: number;
  series: SeriesView;
}>;

export type DayContext = Readonly<{ date: DateOnly }>;

/** Engine state before today's decay, given to `decayMultiplier`. */
export type ItmStateView = Readonly<{
  itm: number;
  level: number;
  /** Days since the last category run (null if none yet). */
  daysSinceCategoryRun: number | null;
  /** Current support charge. */
  support: number;
}>;

export type ScalableRequirement = "longest" | "backToBack" | "accumulated" | "support";

export type ExtraRequirement = { key: string; label: string; have: string; need: string; ok: boolean };

export type ReadinessAdjustment = {
  /** Multipliers on numeric requirements (clamped by the core). */
  scale?: Partial<Record<ScalableRequirement, number>>;
  /** Extra requirements; their keys are prefixed with the modifier id. They can only make readiness harder. */
  extra?: ExtraRequirement[];
};

export type ReadinessHookContext = Readonly<{ date: DateOnly; metrics: Readonly<ReadinessMetrics> }>;

export type ModifierParams = Record<string, number>;

// Method syntax on purpose: it lets a modifier with typed params (`ItmModifier<{ perDecade: number }>`) be used where
// an `ItmModifier` is expected.
export type ModifierHooks<P extends ModifierParams = ModifierParams> = {
  /** How much a session adds (multiplies its gain). */
  effortMultiplier?(activity: Readonly<ItmActivity>, athlete: AthleteView, day: DayContext, params: P): number;
  /** How fast fitness fades (multiplies the day's decay). */
  decayMultiplier?(day: DayContext, athlete: AthleteView, state: ItmStateView, params: P): number;
  /** Scales a level threshold (e.g. age grading). */
  thresholdMultiplier?(levelKey: ItmKey, athlete: AthleteView, params: P): number;
  /** Adjusts or adds readiness requirements of a level. */
  readinessRequirements?(
    levelKey: ItmKey,
    athlete: AthleteView,
    context: ReadinessHookContext,
    params: P,
  ): ReadinessAdjustment | null | undefined;
};

/** A community variable. See docs/MODIFIERS.md. */
export type ItmModifier<P extends ModifierParams = ModifierParams> = {
  /** kebab-case, unique. */
  id: string;
  /** Semver of the modifier itself. */
  version: string;
  name: string;
  description: string;
  /** Peer-reviewed sources or recognised guidelines, as `https://…` URLs or DOIs (`doi:10.…` or `10.…`). */
  references: string[];
  inputs: InputSpec[];
  params: { [K in keyof P]: ParamSpec };
  hooks: ModifierHooks<P>;
};

/** A modifier with its default params, or with some params overridden. */
export type ModifierUse = ItmModifier | { modifier: ItmModifier; params?: Partial<ModifierParams> };
