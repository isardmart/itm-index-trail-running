/**
 * All the numbers of the ITM and of the readiness requirements, in one plain object. The defaults are the ones
 * calibrated against a real Strava history (see docs/SPEC.md §9); a patch only changes the fields it carries.
 *
 * The config is always passed explicitly (to `createItm` or to each standalone function): the package keeps no
 * module-level state.
 */

export type ItmKey = "20k" | "50k" | "100k" | "100m" | "utmb";

/** Level keys, lowest to highest. */
export const ITM_KEYS: readonly ItmKey[] = Object.freeze(["20k", "50k", "100k", "100m", "utmb"] as ItmKey[]);

export type ItmLevelParams = {
  /** ITM at which you have the fitness of this level. */
  threshold: number;
  /** Minimum km effort of a single run of this category. */
  minEffort: number;
  /** Days without decay after a run of this category. */
  grace: number;
};

export type ReadinessRule = {
  /** Longest single day (km effort) in the last 12 weeks. */
  longest: number;
  /** Back-to-back: highest sum of two consecutive days (km effort) in the last 12 weeks. */
  backToBack?: number;
  /** Total km effort in the last 12 weeks. */
  accumulated: number;
  /** Night runs in the last 12 months. */
  nights?: number;
  /** Nights out (bivouac, hut, multi-day route) in the last 12 months. */
  sleptOut?: number;
  /** Weekly average of strength or mobility sessions over the last 8 weeks. */
  support?: number;
  /** A finished race of one of these categories in the last 24 months. */
  previousRace?: ItmKey[];
};

export type ItmConfig = {
  /** Daily decay as a fraction of the current ITM (0.02 = 2 %). */
  decay: number;
  /** Strongest support brake: at full support the decay is multiplied by this. */
  supportFactor: number;
  /** Support "charge" needed for the full brake (less charge → proportional brake). */
  supportFull: number;
  /** Days for one support session to lose half its effect. */
  supportHalfLife: number;
  /** Days (after the grace of the last category run) over which the support brake fades to zero. */
  supportWindow: number;
  /** A level is lost only when ITM drops below `cushion × threshold`. */
  cushion: number;
  /** Minimum distance (km) for a non-category run to be shown as a "run that adds". */
  shortMinKm: number;
  /** Altitude (m) of home, used on days without an altitude stay. */
  homeAltitude: number;
  /** Altitude (m) above which altitude has an effect. */
  altitudeFrom: number;
  /** Runs above `altitudeFrom` add this extra fraction per 1,000 m… */
  altitudeTrainingPer1000: number;
  /** …capped here (0.3 = +30 %). */
  altitudeTrainingMax: number;
  /** Sleeping above `altitudeFrom` cuts the decay by this fraction per 1,000 m… */
  altitudeStayPer1000: number;
  /** …capped here (0.5 = half the decay). */
  altitudeStayMax: number;
  /** Days the stay effect lasts (fading linearly) after coming down. */
  altitudeAfterDays: number;
  levels: Record<ItmKey, ItmLevelParams>;
  readiness: Record<ItmKey, ReadinessRule>;
};

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** The calibrated defaults (deeply frozen). With these and no modifiers, results match isardtrail.com exactly. */
export const DEFAULT_ITM_CONFIG: Readonly<ItmConfig> = deepFreeze<ItmConfig>({
  decay: 0.02,
  supportFactor: 0.5,
  supportFull: 2,
  supportHalfLife: 7,
  supportWindow: 42,
  cushion: 0.8,
  shortMinKm: 9,
  homeAltitude: 12,
  altitudeFrom: 1500,
  altitudeTrainingPer1000: 0.15,
  altitudeTrainingMax: 0.3,
  altitudeStayPer1000: 0.3,
  altitudeStayMax: 0.5,
  altitudeAfterDays: 14,
  levels: {
    "20k": { threshold: 110, minEffort: 20, grace: 3 },
    "50k": { threshold: 250, minEffort: 45, grace: 5 },
    "100k": { threshold: 500, minEffort: 75, grace: 7 },
    "100m": { threshold: 850, minEffort: 155, grace: 14 },
    utmb: { threshold: 1200, minEffort: 278, grace: 21 },
  },
  readiness: {
    "20k": { longest: 15, accumulated: 150 },
    "50k": { longest: 30, accumulated: 350 },
    "100k": {
      longest: 50,
      backToBack: 60,
      accumulated: 650,
      nights: 1,
      support: 1,
      previousRace: ["50k", "100k", "100m", "utmb"],
    },
    "100m": {
      longest: 70,
      backToBack: 90,
      accumulated: 950,
      nights: 2,
      sleptOut: 1,
      support: 1.5,
      previousRace: ["100k", "100m", "utmb"],
    },
    utmb: {
      longest: 90,
      backToBack: 110,
      accumulated: 1200,
      nights: 2,
      sleptOut: 1,
      support: 2,
      previousRace: ["100k", "100m", "utmb"],
    },
  },
});

/** Partial patch: only the fields to change. A readiness requirement set to `null` removes it. */
export type ItmConfigPatch = Partial<Omit<ItmConfig, "levels" | "readiness">> & {
  levels?: Partial<Record<ItmKey, Partial<ItmLevelParams>>>;
  readiness?: Partial<Record<ItmKey, { [K in keyof ReadinessRule]?: ReadinessRule[K] | null }>>;
};

const OPTIONAL_RULES = ["backToBack", "nights", "sleptOut", "support", "previousRace"] as const;

/** Applies a patch on top of a config, without modifying either. */
export function mergeItmConfig(base: Readonly<ItmConfig>, patch: ItmConfigPatch | null | undefined): ItmConfig {
  if (!patch) return base as ItmConfig;
  const { levels, readiness, ...scalars } = patch;
  const defined = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
  const out: ItmConfig = {
    ...base,
    ...defined(scalars),
    levels: { ...base.levels },
    readiness: { ...base.readiness },
  };
  for (const key of ITM_KEYS) {
    const l = levels?.[key];
    if (l) out.levels[key] = { ...base.levels[key], ...defined(l) };
    const r = readiness?.[key];
    if (r) {
      const rule = { ...base.readiness[key], ...defined(r) } as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keys come from the fixed OPTIONAL_RULES list
      for (const k of OPTIONAL_RULES) if (rule[k] === null) delete rule[k];
      out.readiness[key] = rule as ReadinessRule;
    }
  }
  return out;
}

/** Human-readable errors of a config (empty list when it is valid). */
export function validateItmConfig(c: Readonly<ItmConfig>): string[] {
  const errors: string[] = [];
  const between = (name: string, v: number, min: number, max: number) => {
    if (!Number.isFinite(v) || v < min || v > max) errors.push(`${name} must be between ${min} and ${max}.`);
  };
  between("decay", c.decay, 0.001, 0.2);
  between("supportFactor", c.supportFactor, 0, 1);
  between("supportFull", c.supportFull, 0.5, 20);
  between("supportHalfLife", c.supportHalfLife, 1, 60);
  between("supportWindow", c.supportWindow, 1, 365);
  between("cushion", c.cushion, 0.3, 1);
  between("shortMinKm", c.shortMinKm, 0, 100);
  between("homeAltitude", c.homeAltitude, -500, 9000);
  between("altitudeFrom", c.altitudeFrom, 0, 9000);
  between("altitudeTrainingPer1000", c.altitudeTrainingPer1000, 0, 1);
  between("altitudeTrainingMax", c.altitudeTrainingMax, 0, 1);
  between("altitudeStayPer1000", c.altitudeStayPer1000, 0, 1);
  between("altitudeStayMax", c.altitudeStayMax, 0, 0.9);
  between("altitudeAfterDays", c.altitudeAfterDays, 0, 90);
  ITM_KEYS.forEach((key, i) => {
    const l = c.levels[key];
    between(`levels.${key}.threshold`, l.threshold, 1, 100_000);
    between(`levels.${key}.minEffort`, l.minEffort, 1, 1_000);
    between(`levels.${key}.grace`, l.grace, 0, 120);
    const prevKey = ITM_KEYS[i - 1];
    const prev = prevKey ? c.levels[prevKey] : null;
    if (prev && l.threshold <= prev.threshold)
      errors.push(`The threshold of ${key} (${l.threshold}) must be higher than that of ${prevKey}.`);
    if (prev && l.minEffort <= prev.minEffort)
      errors.push(`The minEffort of ${key} (${l.minEffort}) must be higher than that of ${prevKey}.`);
    const r = c.readiness[key];
    between(`readiness.${key}.longest`, r.longest, 0, 1_000);
    between(`readiness.${key}.accumulated`, r.accumulated, 0, 20_000);
    if (r.backToBack !== undefined) between(`readiness.${key}.backToBack`, r.backToBack, 0, 2_000);
    if (r.nights !== undefined) between(`readiness.${key}.nights`, r.nights, 0, 50);
    if (r.sleptOut !== undefined) between(`readiness.${key}.sleptOut`, r.sleptOut, 0, 50);
    if (r.support !== undefined) between(`readiness.${key}.support`, r.support, 0, 14);
    if (r.previousRace && (r.previousRace.length === 0 || r.previousRace.some((k) => !ITM_KEYS.includes(k))))
      errors.push(`readiness.${key}.previousRace must list valid categories (${ITM_KEYS.join(", ")}).`);
  });
  return errors;
}

type ScalarKey = Exclude<keyof ItmConfig, "levels" | "readiness">;
const SCALAR_KEYS = (Object.keys(DEFAULT_ITM_CONFIG) as (keyof ItmConfig)[]).filter(
  (k): k is ScalarKey => k !== "levels" && k !== "readiness",
);

/** What to store: only the fields that differ from the defaults (so defaults can still evolve). */
export function diffFromDefault(c: Readonly<ItmConfig>): ItmConfigPatch {
  const patch: ItmConfigPatch = {};
  for (const k of SCALAR_KEYS) if (c[k] !== DEFAULT_ITM_CONFIG[k]) patch[k] = c[k];
  for (const key of ITM_KEYS) {
    const l = c.levels[key];
    const d = DEFAULT_ITM_CONFIG.levels[key];
    const changed = Object.fromEntries(
      (Object.keys(d) as (keyof ItmLevelParams)[]).filter((k) => l[k] !== d[k]).map((k) => [k, l[k]]),
    );
    if (Object.keys(changed).length) (patch.levels ??= {})[key] = changed;
    const r = c.readiness[key] as Record<string, unknown>;
    const dr = DEFAULT_ITM_CONFIG.readiness[key] as Record<string, unknown>;
    const keys = new Set([...Object.keys(r), ...Object.keys(dr)]);
    const rChanged: Record<string, unknown> = {};
    for (const k of keys)
      if (JSON.stringify(r[k]) !== JSON.stringify(dr[k])) rChanged[k] = r[k] === undefined ? null : r[k];
    if (Object.keys(rChanged).length) (patch.readiness ??= {})[key] = rChanged;
  }
  return patch;
}

/** Thrown by `createItm` when the config it is given is invalid. */
export class ItmConfigError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid ITM config:\n- ${errors.join("\n- ")}`);
    this.name = "ItmConfigError";
  }
}
