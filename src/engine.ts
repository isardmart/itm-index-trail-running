import { DEFAULT_ITM_CONFIG, ITM_KEYS, ItmConfigError, validateItmConfig, type ItmConfig } from "./config";
import { addDays, daysBetween, weekStart, type DateOnly } from "./dates";
import { kmEffort } from "./effort";
import { levels as levelsOf, type ItmLevel } from "./levels";
import { resolveLocale, type LocaleInput } from "./locales";
import {
  AthleteTimeline,
  ItmModifierError,
  decayFactor,
  effortFactor,
  resolveModifiers,
  thresholdFactor,
  validateAthleteProfile,
  type ResolvedModifier,
} from "./modifiers/runtime";
import type { AthleteProfile, ModifierUse } from "./modifiers/types";
import type { ActivityType, AltitudeStay, ItmActivity, ItmBaseline, ItmDay, LevelIndex } from "./types";

/** Options shared by every function that depends on the config and, optionally, on modifiers. */
export type EngineOptions = {
  config?: Readonly<ItmConfig> | undefined;
  /** Community variables. All are off unless listed here. */
  modifiers?: readonly ModifierUse[] | undefined;
  /** Local-only athlete data for the modifiers. Never required, never sent anywhere. */
  athlete?: AthleteProfile | undefined;
};

/** Everything resolved once: config, levels, modifiers and the athlete timeline. Internal. */
export type Engine = {
  readonly config: Readonly<ItmConfig>;
  readonly levels: readonly ItmLevel[];
  readonly mods: readonly ResolvedModifier[];
  readonly athlete: AthleteTimeline;
  readonly homeAltitude: number;
};

/** Builds an engine. Throws on an invalid config, modifier or athlete profile. */
export function makeEngine(options: EngineOptions = {}): Engine {
  const config = options.config ?? DEFAULT_ITM_CONFIG;
  if (config !== DEFAULT_ITM_CONFIG) {
    const errors = validateItmConfig(config);
    if (errors.length) throw new ItmConfigError(errors);
  }
  const profileErrors = validateAthleteProfile(options.athlete);
  if (profileErrors.length) throw new ItmModifierError(profileErrors);
  const athlete = new AthleteTimeline(options.athlete);
  return Object.freeze({
    config,
    levels: Object.freeze(levelsOf(config).map((l) => Object.freeze(l))),
    mods: resolveModifiers(options.modifiers),
    athlete,
    homeAltitude: athlete.homeAltitude ?? config.homeAltitude,
  });
}

const isRun = (t: ActivityType) => t === "run" || t === "trail_run";

type EffortInput = Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m">;

// ——— Speed (a run that is fast for the athlete) ————————————————————————————————————————————————————————————————

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Adjusted pace (km effort per hour of moving time) of a run, or null without distance or moving time. */
export function adjustedPace(a: Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m" | "moving_time_s">) {
  const t = a.moving_time_s;
  if (!isRun(a.type) || !(a.distance_m != null && a.distance_m > 0) || t == null || !Number.isFinite(t) || t <= 0)
    return null;
  return kmEffort(a.distance_m, a.elevation_gain_m) / (t / 3600);
}

/**
 * For each run with an adjusted pace: how much faster it is than the athlete's usual pace (`pace / usual − 1`),
 * where usual = median adjusted pace of the other runs of the `paceWindowDays` days up to its day (same day
 * included, the run itself excluded). Runs with fewer than `paceMinRuns` others in the window are left out.
 * Only runs on or before a run's day are read, so the value never depends on the future.
 */
export function paceRatios(c: Readonly<ItmConfig>, activities: readonly ItmActivity[]): Map<ItmActivity, number> {
  const runs = activities
    .map((a) => ({ a, pace: adjustedPace(a) }))
    .filter((r): r is { a: ItmActivity; pace: number } => r.pace !== null)
    .sort((x, y) => x.a.date.localeCompare(y.a.date));
  const out = new Map<ItmActivity, number>();
  let lo = 0;
  let hi = 0;
  for (const r of runs) {
    const from = addDays(r.a.date, -c.paceWindowDays);
    while (runs[lo]!.a.date < from) lo++;
    while (hi < runs.length && runs[hi]!.a.date <= r.a.date) hi++;
    const others: number[] = [];
    for (let i = lo; i < hi; i++) if (runs[i] !== r) others.push(runs[i]!.pace);
    if (others.length < c.paceMinRuns) continue;
    const usual = median(others);
    if (usual > 0) out.set(r.a, r.pace / usual - 1);
  }
  return out;
}

/** Extra (0 if not faster than usual) for a pace ratio: `min(max, slope × ratio)`. */
export function speedExtra(ratio: number | undefined, max: number, slope: number): number {
  if (ratio === undefined || !(ratio > 0) || !(max > 0)) return 0;
  return Math.min(max, slope * ratio);
}

/** Linear mode: grace days of one run, `min(graceMaxDays, effort / graceKmPerDay × (1 + speed extra))`. */
export function linearGraceDays(effort: number, config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG, extra = 0): number {
  const g = Math.min(config.graceMaxDays, (effort / config.graceKmPerDay) * (1 + extra));
  return Math.max(0, Math.round(g * 1e6) / 1e6);
}

// ——— Altitude ———————————————————————————————————————————————————————————————————————————————————————————————————

const aboveFrom = (c: Readonly<ItmConfig>, altitude: number) => Math.max(0, altitude - c.altitudeFrom) / 1000;

/** Extra fraction a run at this altitude adds (0 below `altitudeFrom` or when unknown). */
export function altitudeTrainingBonus(
  altitude: number | null | undefined,
  config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG,
): number {
  if (altitude == null || !Number.isFinite(altitude)) return 0;
  return Math.min(config.altitudeTrainingMax, aboveFrom(config, altitude) * config.altitudeTrainingPer1000);
}

const stayCut = (c: Readonly<ItmConfig>, altitude: number) =>
  Math.min(c.altitudeStayMax, aboveFrom(c, altitude) * c.altitudeStayPer1000);

/**
 * Fraction by which the decay of a day is cut for sleeping at altitude: the stay's while there, then fading
 * linearly for `altitudeAfterDays`. Without stays, the home altitude's (none at sea level).
 */
export function altitudeStayCut(
  date: DateOnly,
  stays: readonly AltitudeStay[],
  config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG,
  homeAltitude: number = config.homeAltitude,
): number {
  let best = stayCut(config, homeAltitude);
  for (const s of stays) {
    const full = stayCut(config, s.altitude_m);
    if (full <= 0 || date < s.start) continue;
    if (date <= s.end) best = Math.max(best, full);
    else {
      const k = daysBetween(s.end, date);
      if (k <= config.altitudeAfterDays) best = Math.max(best, full * (1 - k / (config.altitudeAfterDays + 1)));
    }
  }
  return best;
}

/** Km effort a run adds, with the altitude bonus (core, no modifiers). */
const boosted = (c: Readonly<ItmConfig>, effort: number, a: Pick<ItmActivity, "altitude_m">) =>
  effort * (1 + altitudeTrainingBonus(a.altitude_m, c));

/** What a session adds to ITM: altitude-boosted effort, times the modifiers' effort factor. */
export function sessionGain(e: Engine, effort: number, a: ItmActivity, date: DateOnly = a.date, speed = 0): number {
  const g = boosted(e.config, effort, a) * (speed > 0 ? 1 + speed : 1);
  return e.mods.length ? g * effortFactor(e.mods, e.athlete, a, date) : g;
}

// ——— Classification ————————————————————————————————————————————————————————————————————————————————————————————

export function qualifyingWith(e: Engine, a: EffortInput): number | null {
  if (!isRun(a.type)) return null;
  const effort = kmEffort(a.distance_m, a.elevation_gain_m);
  return effort >= e.levels[0]!.minEffort ? effort : null;
}

export function shortRunWith(e: Engine, a: EffortInput): number | null {
  if (!isRun(a.type) || (a.distance_m ?? 0) < e.config.shortMinKm * 1000) return null;
  return qualifyingWith(e, a) === null ? kmEffort(a.distance_m, a.elevation_gain_m) : null;
}

export function categoryWith(e: Engine, effort: number): ItmLevel | null {
  let found: ItmLevel | null = null;
  for (const l of e.levels) if (effort >= l.minEffort) found = l;
  return found;
}

/** Km effort of a category run (running and ≥ the 20K `minEffort`), or null. */
export function qualifyingEffort(a: EffortInput, config?: Readonly<ItmConfig>): number | null {
  return qualifyingWith(makeEngine({ config }), a);
}

/** Km effort of a run ≥ `shortMinKm` that is below category (shown as "a run that adds"), or null. */
export function shortRunEffort(a: EffortInput, config?: Readonly<ItmConfig>): number | null {
  return shortRunWith(makeEngine({ config }), a);
}

/** Km effort a run adds and is shown with (category run or run ≥ `shortMinKm`), or null. */
export function countedEffort(a: EffortInput, config?: Readonly<ItmConfig>): number | null {
  const e = makeEngine({ config });
  return qualifyingWith(e, a) ?? shortRunWith(e, a);
}

/** Category of a run: the highest level whose `minEffort` it reaches, or null. */
export function sessionCategory(effort: number, config?: Readonly<ItmConfig>): ItmLevel | null {
  return categoryWith(makeEngine({ config }), effort);
}

// ——— Levels ————————————————————————————————————————————————————————————————————————————————————————————————————

/** Level thresholds on a day (scaled by the modifiers' threshold factors, if any). */
export function thresholdsOn(e: Engine, date: DateOnly): number[] {
  if (!e.mods.length) return e.levels.map((l) => l.threshold);
  return ITM_KEYS.map((key, i) => e.levels[i]!.threshold * thresholdFactor(e.mods, e.athlete, key, date));
}

function nextLevel(level: LevelIndex, itm: number, thresholds: readonly number[], cushion: number): LevelIndex {
  let l: number = level;
  while (l < thresholds.length && itm >= thresholds[l]!) l++;
  while (l > 0 && itm < thresholds[l - 1]! * cushion) l--;
  return l as LevelIndex; // 0 ≤ l ≤ thresholds.length (5)
}

/** Next level to reach (null at the top) and the ITM still missing. */
export function nextItmLevel(itm: number, config?: Readonly<ItmConfig>): { level: ItmLevel; missing: number } | null {
  return nextLevelFor(makeEngine({ config }), itm);
}

export function nextLevelFor(e: Engine, itm: number, date?: DateOnly): { level: ItmLevel; missing: number } | null {
  const thresholds = date ? thresholdsOn(e, date) : e.levels.map((l) => l.threshold);
  const i = thresholds.findIndex((t) => itm < t);
  return i < 0 ? null : { level: e.levels[i]!, missing: Math.ceil(thresholds[i]! - itm) };
}

// ——— Simulation ————————————————————————————————————————————————————————————————————————————————————————————————

export type SimulateOptions = EngineOptions & {
  /**
   * Start of the series and the ITM then. Default: the first activity date, ITM 0. If an activity is earlier than
   * the baseline date, the series starts there at 0.
   */
  baseline?: ItmBaseline | undefined;
  /** Nights slept at altitude. */
  stays?: readonly AltitudeStay[] | undefined;
};

/** Daily ITM series from the baseline (or the first activity, if earlier) to `until`, inclusive. */
export function simulateItm(
  activities: readonly ItmActivity[],
  until: DateOnly,
  options: SimulateOptions = {},
): ItmDay[] {
  return simulateWith(makeEngine(options), activities, until, options.baseline, options.stays);
}

export function simulateWith(
  e: Engine,
  activities: readonly ItmActivity[],
  until: DateOnly,
  baselineOption?: ItmBaseline,
  stays: readonly AltitudeStay[] = [],
): ItmDay[] {
  const c = e.config;
  const byDate = new Map<DateOnly, ItmActivity[]>();
  for (const a of activities) byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  const first = [...byDate.keys()].sort()[0];
  const baseline = baselineOption ?? { date: first ?? until, itm: 0 };
  const start = first && first < baseline.date ? first : baseline.date;
  const modded = e.mods.length > 0;
  const decayMods = e.mods.some((m) => m.modifier.hooks.decayMultiplier);
  const baseThresholds = e.levels.map((l) => l.threshold);
  const thresholds = (d: DateOnly) => (modded ? thresholdsOn(e, d) : baseThresholds);

  const linear = c.graceMode === "linear";
  const ratios =
    (linear && c.speedGraceMax > 0) || c.speedPointsMax > 0
      ? paceRatios(c, activities)
      : new Map<ItmActivity, number>();
  // Linear grace: the day index (from `start`) up to which decay is off, with its fraction: runs do not add up, the
  // latest end wins. -Infinity = no run yet.
  let graceEnd = -Infinity;
  // Linear grace: same, for category runs only. The support brake fades from here, as it does from the category
  // run in levels mode, so short runs alone never keep it alive.
  let categoryEnd = -Infinity;
  // Linear grace: free share (0–1) given on each day since `start`, to keep the budget (see `graceWindowDays`).
  const credits: number[] = [];

  const out: ItmDay[] = [];
  let itm = start === baseline.date ? baseline.itm : 0;
  let level = nextLevel(0, itm, thresholds(start), c.cushion);
  let lastQual = null as { date: DateOnly; grace: number } | null;
  // Support brake: each session charges it and it discharges a little every day (no jumps).
  let support = 0;
  const keep = c.supportHalfLife > 0 ? 0.5 ** (1 / c.supportHalfLife) : 0;

  for (let d = start; d <= until; d = addDays(d, 1)) {
    const today = byDate.get(d) ?? [];
    let decay = 0;
    if (d > start) {
      support *= keep;
      const since = lastQual ? daysBetween(lastQual.date, d) : Infinity;
      const grace = lastQual?.grace ?? 0;
      const day = linear ? daysBetween(start, d) : 0;
      // Linear: share of the day's decay that grace does not cover (0 = a free day, 1 = no grace).
      let factor = 1;
      if (linear) {
        const free = Math.floor(graceEnd);
        factor = day > free + 1 ? 1 : day === free + 1 ? 1 - (graceEnd - free) : 0;
        let credit = 1 - factor;
        if (credit > 0 && c.graceWindowDays > 0) {
          // Grace is a budget: at most `graceMaxDays` free days in any `graceWindowDays` window, so a run every day
          // can never switch the decay off for good.
          let used = 0;
          for (let i = Math.max(0, day - c.graceWindowDays + 1); i < day; i++) used += credits[i] ?? 0;
          credit = Math.min(credit, Math.max(0, c.graceMaxDays - used));
          factor = 1 - credit;
        }
        credits[day] = credit;
      }
      if (linear ? factor > 0 : since > grace) {
        // Support alone does not hold fitness forever: the brake fades the longer since the last category run.
        const sinceCategory = linear ? day - categoryEnd : since - grace;
        const fade = Math.min(1, Math.max(0, 1 - sinceCategory / c.supportWindow));
        const brake = (1 - c.supportFactor) * Math.min(1, support / c.supportFull) * fade;
        decay = itm * c.decay * (1 - brake) * (1 - altitudeStayCut(d, stays, c, e.homeAltitude));
        // The first day after the whole grace days only loses what the fraction of a day does not cover.
        if (linear) decay *= factor;
        if (decayMods)
          decay *= decayFactor(e.mods, e.athlete, d, {
            itm,
            level,
            daysSinceCategoryRun: lastQual ? since : null,
            support,
          });
      }
    }
    let gain = 0;
    for (const a of today) {
      const effort = qualifyingWith(e, a);
      const ratio = ratios.get(a);
      const points = speedExtra(ratio, c.speedPointsMax, c.speedGraceSlope);
      if (linear && isRun(a.type)) {
        const extra = speedExtra(ratio, c.speedGraceMax, c.speedGraceSlope);
        const end = daysBetween(start, d) + linearGraceDays(kmEffort(a.distance_m, a.elevation_gain_m), c, extra);
        graceEnd = Math.max(graceEnd, end);
        if (effort !== null) categoryEnd = Math.max(categoryEnd, end);
      }
      if (effort !== null) {
        gain += sessionGain(e, effort, a, d, points);
        const cat = categoryWith(e, effort)!;
        lastQual = { date: d, grace: lastQual?.date === d ? Math.max(lastQual.grace, cat.grace) : cat.grace };
      } else if (a.type !== "rest") {
        if (isRun(a.type)) gain += sessionGain(e, kmEffort(a.distance_m, a.elevation_gain_m), a, d, points);
        support = Math.min(support + 1, c.supportFull * 2);
      }
    }
    itm = Math.max(0, itm - decay + gain);
    level = nextLevel(level, itm, thresholds(d), c.cushion);
    out.push({ date: d, itm: Math.round(itm * 100) / 100, level, gain, decay: Math.round(decay * 100) / 100 });
  }
  return out;
}

// ——— Helpers on the series ————————————————————————————————————————————————————————————————————————————————————

/** ITM on a day (the last known value, or 0 before the series starts). */
export function itmOn(series: readonly ItmDay[], date: DateOnly): number {
  let v = 0;
  for (const s of series) {
    if (s.date > date) break;
    v = s.itm;
  }
  return v;
}

/** Daily changes (in ITM): adding them up to a day gives that day's ITM. */
export function itmDeltas(series: readonly ItmDay[]): { day: DateOnly; points: number }[] {
  const out: { day: DateOnly; points: number }[] = [];
  let prev = 0;
  for (const s of series) {
    const delta = Math.round((s.itm - prev) * 100) / 100;
    if (delta !== 0) out.push({ day: s.date, points: delta });
    prev = s.itm;
  }
  return out;
}

export type ItmEvent = { day: DateOnly; kind: "session" | "decay" | "level"; delta: number; label: string };

export type EventsOptions = EngineOptions & { locale?: LocaleInput | undefined };

/** Events that explain the series: sessions that add, weekly decay (≥ 1) and level changes. */
export function itmEvents(
  series: readonly ItmDay[],
  activities: readonly ItmActivity[],
  options: EventsOptions = {},
): ItmEvent[] {
  return eventsWith(makeEngine(options), series, activities, options.locale);
}

export function eventsWith(
  e: Engine,
  series: readonly ItmDay[],
  activities: readonly ItmActivity[],
  localeInput?: LocaleInput,
): ItmEvent[] {
  const t = resolveLocale(localeInput);
  const levelNames = [t.noLevel, ...e.levels.map((l) => l.label)];
  const events: ItmEvent[] = [];
  type Counted = { effort: number; gain: number; high: boolean };
  const ratios = e.config.speedPointsMax > 0 ? paceRatios(e.config, activities) : new Map<ItmActivity, number>();
  const counted = (effort: number, a: ItmActivity): Counted => ({
    effort,
    gain: sessionGain(
      e,
      effort,
      a,
      a.date,
      speedExtra(ratios.get(a), e.config.speedPointsMax, e.config.speedGraceSlope),
    ),
    // "At altitude" depends on the core altitude bonus only, never on other modifiers.
    high: boosted(e.config, effort, a) > effort + 0.5,
  });
  const efforts = new Map<DateOnly, Counted[]>();
  const shorts = new Map<DateOnly, Counted[]>();
  for (const a of activities) {
    const q = qualifyingWith(e, a);
    if (q !== null) efforts.set(a.date, [...(efforts.get(a.date) ?? []), counted(q, a)]);
    const sh = shortRunWith(e, a);
    if (sh !== null) shorts.set(a.date, [...(shorts.get(a.date) ?? []), counted(sh, a)]);
  }
  const weeks = new Map<DateOnly, { lost: number; last: DateOnly }>();
  let prevLevel = series[0]?.level ?? 0;
  for (const s of series) {
    for (const c of efforts.get(s.date) ?? []) {
      const cat = categoryWith(e, c.effort)!;
      events.push({
        day: s.date,
        kind: "session",
        delta: Math.round(c.gain),
        label: t.events.categoryRun(cat.label, c.high),
      });
    }
    for (const c of shorts.get(s.date) ?? []) {
      events.push({ day: s.date, kind: "session", delta: Math.round(c.gain), label: t.events.run(c.high) });
    }
    if (s.decay > 0) {
      const w = weekStart(s.date);
      const cur = weeks.get(w) ?? { lost: 0, last: s.date };
      weeks.set(w, { lost: cur.lost + s.decay, last: s.date });
    }
    if (s.level !== prevLevel) {
      const name = levelNames[s.level]!;
      events.push({
        day: s.date,
        kind: "level",
        delta: 0,
        label: s.level > prevLevel ? t.events.levelUp(name) : t.events.levelDown(name),
      });
      prevLevel = s.level;
    }
  }
  for (const w of weeks.values()) {
    if (w.lost >= 1)
      events.push({ day: w.last, kind: "decay", delta: -Math.round(w.lost), label: t.events.weeklyDecay });
  }
  return events.sort((a, b) => a.day.localeCompare(b.day));
}
