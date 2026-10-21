/**
 * @isardtrail/itm — ITM · Isard Trail Meters.
 * Created by Isard Trail (https://isardtrail.com). MIT licence.
 */

// Config
export {
  DEFAULT_ITM_CONFIG,
  ITM_KEYS,
  ItmConfigError,
  diffFromDefault,
  mergeItmConfig,
  validateItmConfig,
  type ItmConfig,
  type ItmConfigPatch,
  type ItmKey,
  type ItmLevelParams,
  type ReadinessRule,
} from "./config";

// Bound API
export { createItm, type CreateItmOptions, type Itm } from "./createItm";

// Standalone functions (config as an argument, defaults to DEFAULT_ITM_CONFIG)
export { addDays, daysBetween, isDateOnly, weekStart, type DateOnly } from "./dates";
export { kmEffort } from "./effort";
export {
  altitudeStayCut,
  altitudeTrainingBonus,
  countedEffort,
  itmDeltas,
  itmEvents,
  itmOn,
  nextItmLevel,
  qualifyingEffort,
  sessionCategory,
  shortRunEffort,
  simulateItm,
  type EngineOptions,
  type EventsOptions,
  type ItmEvent,
  type SimulateOptions,
} from "./engine";
export { LEVEL_LOOK, levels, type ItmLevel } from "./levels";
export {
  raceKey,
  readinessFor,
  readinessMetrics,
  readyFor,
  type Readiness,
  type ReadinessInput,
  type ReadinessMetrics,
  type ReadinessOptions,
  type ReadinessSession,
  type Requirement,
  type RequirementKey,
} from "./readiness";
export type { ActivityType, AltitudeStay, ItmActivity, ItmBaseline, ItmDay } from "./types";

// Presentation
export { nextZone, zoneForItm, zoneForLevel, zones, type Zone, type ZoneKey } from "./zones";
export { LOCALES, ca, en, type ItmLocale, type LocaleCode, type LocaleInput } from "./locales";

// Data adapters
export { SLEEP_MIN_HOURS, isNightRun, sleptOutIds, type TimedActivity } from "./nightOut";
export {
  IMPORTED_STRAVA_CATEGORIES,
  fromStravaActivity,
  stravaAltitude,
  stravaCategory,
  type FromStravaOptions,
  type StravaCategory,
  type StravaSummaryActivity,
} from "./strava";

// Modifiers
export { ageModifier, type AgeParams } from "./modifiers/age";
export { carriedLoadModifier, type CarriedLoadParams } from "./modifiers/carriedLoad";
export { MODIFIER_REGISTRY, getModifier, type RegistryEntry } from "./modifiers/registry";
export {
  BODY_MASS_MULTIPLIER_MAX,
  ItmModifierError,
  MULTIPLIER_MAX,
  MULTIPLIER_MIN,
  clampMultiplier,
  defineModifier,
  validateAthleteProfile,
  validateModifier,
} from "./modifiers/runtime";
export type {
  ActivityField,
  AthleteField,
  AthleteProfile,
  AthleteView,
  DatedValue,
  DayContext,
  ExtraRequirement,
  InputSpec,
  ItmModifier,
  ItmStateView,
  ModifierHooks,
  ModifierParams,
  ModifierUse,
  ParamSpec,
  ProfileSeriesKey,
  ReadinessAdjustment,
  ReadinessHookContext,
  ScalableRequirement,
  SeriesKey,
  SeriesView,
} from "./modifiers/types";
