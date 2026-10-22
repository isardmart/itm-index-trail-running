import type { ItmKey } from "../config";
import { addDays, isDateOnly, type DateOnly } from "../dates";
import type { ReadinessMetrics } from "../readiness";
import type { ItmActivity } from "../types";
import type {
  ActivityField,
  AthleteField,
  AthleteProfile,
  AthleteView,
  DatedValue,
  ExtraRequirement,
  InputSpec,
  ItmModifier,
  ItmStateView,
  ModifierParams,
  ModifierUse,
  ProfileSeriesKey,
  ScalableRequirement,
  SeriesKey,
  SeriesView,
} from "./types";

/** Every multiplier a hook returns, and the product of all of them, is clamped to this range. */
export const MULTIPLIER_MIN = 0.5;
export const MULTIPLIER_MAX = 1.5;
/**
 * A modifier that reads body mass may only normalise effort (e.g. carried load), and only upwards and by at most
 * this much. It never sees a body mass lower than the highest one known so far.
 */
export const BODY_MASS_MULTIPLIER_MAX = 1.1;

const ATHLETE_FIELDS: readonly AthleteField[] = [
  "age",
  "sex",
  "bodyMassKg",
  "restingHr",
  "maxHr",
  "vo2max",
  "homeAltitude",
];
const SERIES_KEYS: readonly SeriesKey[] = ["restingHr", "sleepHours", "hrvRmssd"];
const PROFILE_SERIES_KEYS: readonly ProfileSeriesKey[] = [...SERIES_KEYS, "bodyMassKg"];
const ACTIVITY_FIELDS: readonly ActivityField[] = ["altitude_m", "carriedLoadKg", "temperatureC"];
const HOOKS = ["effortMultiplier", "decayMultiplier", "thresholdMultiplier", "readinessRequirements"] as const;
const SCALABLE: readonly ScalableRequirement[] = ["longest", "backToBack", "accumulated", "support"];

/** Variables ITM must never reward (and no modifier may be built around). */
const FORBIDDEN = /pain|injur|fasting|weight[\s_-]?loss|calori|deficit|diet|starv/i;
const REFERENCE = /^(https?:\/\/\S+\.\S+|doi:10\.\d{4,9}\/\S+|10\.\d{4,9}\/\S+)$/i;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const MODIFIER_ID = /^[a-z][a-z0-9-]{1,39}$/;

/** Ranges outside which a profile value is rejected as a data error. */
const PROFILE_RANGES: Record<Exclude<AthleteField, "sex">, [number, number]> = {
  age: [5, 110],
  bodyMassKg: [20, 250],
  restingHr: [20, 120],
  maxHr: [100, 240],
  vo2max: [10, 100],
  homeAltitude: [-500, 9000],
};

export class ItmModifierError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid ITM modifier setup:\n- ${errors.join("\n- ")}`);
    this.name = "ItmModifierError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const usesBodyMass = (inputs: readonly unknown[]) => inputs.some((i) => isRecord(i) && i.field === "bodyMassKg");

type FieldOf = { [S in InputSpec["source"]]: Extract<InputSpec, { source: S }>["field"] };

/** Fields of the inputs of one source, typed by that source (optionally only the required ones). */
function inputFields<S extends InputSpec["source"]>(
  inputs: readonly InputSpec[],
  source: S,
  requiredOnly = false,
): FieldOf[S][] {
  const out: FieldOf[S][] = [];
  // The `source` check is what narrows `field`; TypeScript cannot follow it through the generic.
  for (const i of inputs)
    if (i.source === source && (!requiredOnly || i.required !== false)) out.push(i.field as FieldOf[S]);
  return out;
}

/**
 * Errors of a modifier definition (empty when it can be used). Takes `unknown` on purpose: modifiers may come from
 * plain JavaScript, so every field is checked at runtime.
 */
export function validateModifier(value: unknown): string[] {
  const errors: string[] = [];
  const m = isRecord(value) ? value : {};
  const id = typeof m.id === "string" ? m.id : "?";
  const err = (msg: string) => errors.push(`${id}: ${msg}`);
  if (!MODIFIER_ID.test(id)) err("id must be kebab-case (2–40 chars, a-z, 0-9, -).");
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) err("version must be semver (e.g. 1.0.0).");
  if (typeof m.name !== "string" || !m.name.trim()) err("name is required.");
  if (typeof m.description !== "string" || !m.description.trim()) err("description is required.");
  const references: readonly unknown[] = Array.isArray(m.references) ? m.references : [];
  if (references.length === 0) err("references must list at least one peer-reviewed source or recognised guideline.");
  for (const r of references)
    if (typeof r !== "string" || !REFERENCE.test(r))
      err(`reference ${JSON.stringify(r)} must be an https URL or a DOI.`);
  if (FORBIDDEN.test(id) || (typeof m.name === "string" && FORBIDDEN.test(m.name)))
    err("ITM never rewards pain, injury, fasting, calorie deficit or weight loss.");

  const inputs: readonly unknown[] = Array.isArray(m.inputs) ? m.inputs : [];
  if (!Array.isArray(m.inputs)) err("inputs must be an array.");
  for (const raw of inputs) {
    const input = isRecord(raw) ? raw : {};
    const allowed: readonly string[] =
      input.source === "athlete"
        ? ATHLETE_FIELDS
        : input.source === "series"
          ? SERIES_KEYS
          : input.source === "activity"
            ? ACTIVITY_FIELDS
            : [];
    if (typeof input.field !== "string" || !allowed.includes(input.field))
      err(`input ${String(input.source)}.${String(input.field)} is not an allowed field.`);
  }

  const params = isRecord(m.params) ? m.params : {};
  for (const [k, raw] of Object.entries(params)) {
    const { default: def, min, max } = isRecord(raw) ? raw : {};
    if (FORBIDDEN.test(k)) err(`param ${k}: ITM never rewards pain, injury, fasting, calorie deficit or weight loss.`);
    if (!isFiniteNumber(def) || !isFiniteNumber(min) || !isFiniteNumber(max))
      err(`param ${k} needs finite default, min and max.`);
    else if (!(min <= def && def <= max)) err(`param ${k}: default must be within [min, max].`);
  }

  const hooks = isRecord(m.hooks) ? m.hooks : {};
  const defined = HOOKS.filter((h) => hooks[h] !== undefined);
  for (const k of Object.keys(hooks))
    if (!(HOOKS as readonly string[]).includes(k)) err(`unknown hook "${k}" (allowed: ${HOOKS.join(", ")}).`);
  for (const h of defined) if (typeof hooks[h] !== "function") err(`hook ${h} must be a function.`);
  if (defined.length === 0) err("at least one hook is required.");
  if (usesBodyMass(inputs) && defined.some((h) => h !== "effortMultiplier"))
    err("body mass may only be used to normalise effort (effortMultiplier), never decay, thresholds or readiness.");
  return errors;
}

export type ResolvedModifier = {
  readonly modifier: ItmModifier;
  readonly params: Readonly<ModifierParams>;
  readonly bodyMass: boolean;
  readonly athleteFields: ReadonlySet<AthleteField>;
  readonly seriesKeys: ReadonlySet<SeriesKey>;
  readonly required: {
    readonly athlete: readonly AthleteField[];
    readonly series: readonly SeriesKey[];
    readonly activity: readonly ActivityField[];
  };
};

/** Validates modifiers and their params and freezes them for the engine. Throws `ItmModifierError`. */
export function resolveModifiers(uses: readonly ModifierUse[] | undefined): ResolvedModifier[] {
  if (!uses || uses.length === 0) return [];
  const errors: string[] = [];
  const seen = new Set<string>();
  const out: ResolvedModifier[] = [];
  for (const use of uses) {
    const modifier = "modifier" in use ? use.modifier : use;
    const overrides = "modifier" in use ? (use.params ?? {}) : {};
    const own = validateModifier(modifier);
    if (seen.has(modifier.id)) own.push(`${modifier.id}: used twice.`);
    seen.add(modifier.id);
    const params: ModifierParams = {};
    if (own.length === 0) {
      for (const [k, spec] of Object.entries(modifier.params)) params[k] = spec.default;
      for (const [k, v] of Object.entries(overrides)) {
        const spec = modifier.params[k];
        if (!spec) own.push(`${modifier.id}: unknown param "${k}".`);
        else if (!isFiniteNumber(v) || v < spec.min || v > spec.max)
          own.push(`${modifier.id}: param ${k} must be between ${spec.min} and ${spec.max}.`);
        else params[k] = v;
      }
    }
    errors.push(...own);
    if (own.length) continue;
    out.push(
      Object.freeze({
        modifier,
        params: Object.freeze(params),
        bodyMass: usesBodyMass(modifier.inputs),
        athleteFields: new Set(inputFields(modifier.inputs, "athlete")),
        seriesKeys: new Set(inputFields(modifier.inputs, "series")),
        required: Object.freeze({
          athlete: inputFields(modifier.inputs, "athlete", true),
          series: inputFields(modifier.inputs, "series", true),
          activity: inputFields(modifier.inputs, "activity", true),
        }),
      }),
    );
  }
  if (errors.length) throw new ItmModifierError(errors);
  return out;
}

/** Data errors of an athlete profile (empty when it is usable). Takes `unknown`: profiles often come from storage. */
export function validateAthleteProfile(value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return ["athlete must be an object."];
  const errors: string[] = [];
  for (const [field, [min, max]] of Object.entries(PROFILE_RANGES)) {
    const v = value[field];
    if (v !== undefined && !(isFiniteNumber(v) && v >= min && v <= max))
      errors.push(`athlete.${field} must be between ${min} and ${max}.`);
  }
  if (value.sex !== undefined && value.sex !== "female" && value.sex !== "male")
    errors.push(`athlete.sex must be female or male.`);
  if (value.birthDate !== undefined && !isDateOnly(value.birthDate))
    errors.push("athlete.birthDate must be YYYY-MM-DD.");
  if (value.series !== undefined && !isRecord(value.series)) errors.push("athlete.series must be an object.");
  for (const [key, values] of Object.entries(isRecord(value.series) ? value.series : {})) {
    if (!(PROFILE_SERIES_KEYS as readonly string[]).includes(key))
      errors.push(`athlete.series.${key} is not a known series.`);
    if (values === undefined) continue;
    const entries: readonly unknown[] = Array.isArray(values) ? values : [];
    if (!Array.isArray(values)) errors.push(`athlete.series.${key} must be an array.`);
    for (const v of entries)
      if (!isRecord(v) || !isDateOnly(v.date) || !isFiniteNumber(v.value))
        errors.push(`athlete.series.${key} has an invalid entry (${JSON.stringify(v)}).`);
  }
  return errors;
}

const sortSeries = (values: readonly DatedValue[] | undefined): DatedValue[] =>
  [...(values ?? [])].sort((a, b) => a.date.localeCompare(b.date));

/** Index of the last entry dated on or before `date` (−1 if none). */
function lastOnOrBefore(sorted: readonly DatedValue[], date: DateOnly): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.date <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function ageOn(birthDate: DateOnly, date: DateOnly): number | undefined {
  if (date < birthDate) return undefined;
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/**
 * The athlete over time, as hooks see it. Every view is bound to one day and is causal: it never reveals a value
 * dated after that day.
 */
export class AthleteTimeline {
  private readonly profile: AthleteProfile;
  private readonly series = new Map<SeriesKey, DatedValue[]>();
  private readonly mass: DatedValue[];
  private readonly massPrefixMax: number[];

  constructor(profile: AthleteProfile | undefined) {
    this.profile = profile ?? {};
    for (const key of SERIES_KEYS) this.series.set(key, sortSeries(this.profile.series?.[key]));
    this.mass = sortSeries(this.profile.series?.bodyMassKg);
    let max = -Infinity;
    this.massPrefixMax = this.mass.map((v) => (max = Math.max(max, v.value)));
  }

  /** Home altitude from the profile, if given (replaces `config.homeAltitude`). */
  get homeAltitude(): number | undefined {
    return this.profile.homeAltitude;
  }

  private field(field: AthleteField, date: DateOnly): number | string | undefined {
    const p = this.profile;
    switch (field) {
      case "age":
        return p.birthDate ? ageOn(p.birthDate, date) : p.age;
      case "bodyMassKg": {
        // Highest body mass known so far: weight going down can never change the result.
        const i = lastOnOrBefore(this.mass, date);
        const fromSeries = i >= 0 ? this.massPrefixMax[i]! : undefined;
        if (p.bodyMassKg === undefined) return fromSeries;
        return fromSeries === undefined ? p.bodyMassKg : Math.max(p.bodyMassKg, fromSeries);
      }
      default:
        return p[field];
    }
  }

  /** The view of a modifier on a day, or null when one of its required inputs is missing. */
  viewFor(m: ResolvedModifier, date: DateOnly): AthleteView | null {
    const view: Record<string, unknown> = {};
    for (const f of m.athleteFields) {
      const v = this.field(f, date);
      if (v !== undefined) view[f] = v;
    }
    if (m.required.athlete.some((f) => view[f] === undefined)) return null;
    const series = this.seriesView(m.seriesKeys, date);
    if (m.required.series.some((k) => series.latest(k) === undefined)) return null;
    view.series = series;
    return Object.freeze(view) as AthleteView;
  }

  private seriesView(allowed: ReadonlySet<SeriesKey>, date: DateOnly): SeriesView {
    const get = (key: SeriesKey) => (allowed.has(key) ? this.series.get(key)! : []);
    return Object.freeze({
      latest: (key: SeriesKey, maxAgeDays?: number) => {
        const s = get(key);
        const i = lastOnOrBefore(s, date);
        if (i < 0) return undefined;
        if (maxAgeDays !== undefined && s[i]!.date <= addDays(date, -maxAgeDays - 1)) return undefined;
        return s[i]!.value;
      },
      window: (key: SeriesKey, days: number) => {
        const s = get(key);
        const from = addDays(date, -days);
        const end = lastOnOrBefore(s, date);
        const out: number[] = [];
        for (let i = end; i >= 0 && s[i]!.date > from; i--) out.unshift(s[i]!.value);
        return out;
      },
    });
  }
}

/** Clamps a multiplier; anything that is not a finite number is neutral (1). */
export function clampMultiplier(v: unknown, min = MULTIPLIER_MIN, max = MULTIPLIER_MAX): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  return Math.min(max, Math.max(min, v));
}

function run<T>(m: ResolvedModifier, hook: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new ItmModifierError([`${m.modifier.id}.${hook} threw: ${e instanceof Error ? e.message : String(e)}`]);
  }
}

/** Product of the effort multipliers of an activity (1 without modifiers). */
export function effortFactor(
  mods: readonly ResolvedModifier[],
  athlete: AthleteTimeline,
  a: ItmActivity,
  date: DateOnly,
): number {
  let f = 1;
  for (const m of mods) {
    const hook = m.modifier.hooks.effortMultiplier;
    if (!hook) continue;
    if (m.required.activity.some((k) => typeof a[k] !== "number" || !Number.isFinite(a[k]))) continue;
    const view = athlete.viewFor(m, date);
    if (!view) continue;
    const v = run(m, "effortMultiplier", () => hook(Object.freeze({ ...a }), view, Object.freeze({ date }), m.params));
    f *= m.bodyMass ? clampMultiplier(v, 1, BODY_MASS_MULTIPLIER_MAX) : clampMultiplier(v);
  }
  return clampMultiplier(f);
}

/** Product of the decay multipliers of a day (1 without modifiers). */
export function decayFactor(
  mods: readonly ResolvedModifier[],
  athlete: AthleteTimeline,
  date: DateOnly,
  state: ItmStateView,
): number {
  let f = 1;
  const frozen = Object.freeze({ ...state });
  for (const m of mods) {
    const hook = m.modifier.hooks.decayMultiplier;
    if (!hook) continue;
    const view = athlete.viewFor(m, date);
    if (!view) continue;
    f *= clampMultiplier(run(m, "decayMultiplier", () => hook(Object.freeze({ date }), view, frozen, m.params)));
  }
  return clampMultiplier(f);
}

/** Product of the threshold multipliers of a level on a day (1 without modifiers). */
export function thresholdFactor(
  mods: readonly ResolvedModifier[],
  athlete: AthleteTimeline,
  key: ItmKey,
  date: DateOnly,
): number {
  let f = 1;
  for (const m of mods) {
    const hook = m.modifier.hooks.thresholdMultiplier;
    if (!hook) continue;
    const view = athlete.viewFor(m, date);
    if (!view) continue;
    f *= clampMultiplier(run(m, "thresholdMultiplier", () => hook(key, view, m.params)));
  }
  return clampMultiplier(f);
}

export type ResolvedReadinessAdjustment = {
  scale: Record<ScalableRequirement, number>;
  extra: ExtraRequirement[];
};

/** Combined readiness adjustments of a level on a day. */
export function readinessAdjustment(
  mods: readonly ResolvedModifier[],
  athlete: AthleteTimeline,
  key: ItmKey,
  date: DateOnly,
  metrics: ReadinessMetrics,
): ResolvedReadinessAdjustment {
  const scale = { longest: 1, backToBack: 1, accumulated: 1, support: 1 };
  const extra: ExtraRequirement[] = [];
  const context = Object.freeze({ date, metrics: Object.freeze({ ...metrics, races: [...metrics.races] }) });
  for (const m of mods) {
    const hook = m.modifier.hooks.readinessRequirements;
    if (!hook) continue;
    const view = athlete.viewFor(m, date);
    if (!view) continue;
    const adj = run(m, "readinessRequirements", () => hook(key, view, context, m.params));
    if (!adj) continue;
    for (const k of SCALABLE) {
      const s = adj.scale?.[k];
      if (s !== undefined) scale[k] *= clampMultiplier(s);
    }
    // What a hook returns is checked at runtime too: modifiers may be plain JavaScript.
    const extras: readonly unknown[] = adj.extra ?? [];
    for (const r of extras) {
      if (!isRecord(r) || typeof r.key !== "string" || typeof r.label !== "string" || typeof r.ok !== "boolean")
        throw new ItmModifierError([`${m.modifier.id}.readinessRequirements returned an invalid extra requirement.`]);
      extra.push({
        key: `${m.modifier.id}:${r.key}`,
        label: r.label,
        have: text(r.have),
        need: text(r.need),
        ok: r.ok,
      });
    }
  }
  for (const k of SCALABLE) scale[k] = clampMultiplier(scale[k]);
  return { scale, extra };
}

const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Validates a modifier definition and deep-freezes it. Throws `ItmModifierError` when it is invalid. */
export function defineModifier<P extends ModifierParams>(m: ItmModifier<P>): ItmModifier<P> {
  const errors = validateModifier(m);
  if (errors.length) throw new ItmModifierError(errors);
  return deepFreeze(m);
}

/**
 * A modifier with some params overridden, checked at compile time against the modifier's own params:
 *
 * ```ts
 * createItm({ modifiers: [withParams(ageModifier, { mastersFrom: 40 })] }); // ok
 * createItm({ modifiers: [withParams(ageModifier, { masterFrom: 40 })] }); // type error: unknown param
 * ```
 *
 * Ranges (`min`/`max`) are still checked at runtime, by `createItm` and the standalone functions.
 */
export function withParams<P extends ModifierParams>(
  modifier: ItmModifier<P>,
  params: Partial<NoInfer<P>>,
): ModifierUse {
  return { modifier, params };
}
