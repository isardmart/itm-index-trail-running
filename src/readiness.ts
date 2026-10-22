import { DEFAULT_ITM_CONFIG, type ItmConfig, type ItmKey } from "./config";
import { addDays, weekStart, type DateOnly } from "./dates";
import { makeEngine, thresholdsOn, type Engine, type EngineOptions } from "./engine";
import type { ItmLevel } from "./levels";
import { resolveLocale, type LocaleInput } from "./locales";
import { readinessAdjustment } from "./modifiers/runtime";

/**
 * "Ready for" a category = fitness (ITM at the threshold) + training requirements: long runs, back-to-backs, volume,
 * nights, mobility and previous races. Everything is evaluated up to a date (the past never changes).
 */

export type ReadinessSession = {
  date: DateOnly;
  /** Km effort of the run. */
  effort: number;
  /** Ran (partly) at night. */
  night: boolean;
  /** Slept out (bivouac, hut, multi-day route). */
  sleptOut: boolean;
};

export type ReadinessInput = {
  /** Running sessions. */
  sessions: ReadinessSession[];
  /** Strength and mobility sessions per Monday-week (private ones included: only the count is used). */
  supportWeeks: { week: DateOnly; count: number }[];
  /** Finished races and their category. */
  races: { date: DateOnly; key: ItmKey }[];
};

export type RequirementKey =
  | "itm"
  | "longest"
  | "backToBack"
  | "accumulated"
  | "nights"
  | "sleptOut"
  | "support"
  | "previousRace"
  /** Extra requirements added by modifiers: `<modifier id>:<key>`. */
  | `${string}:${string}`;

export type Requirement = {
  key: RequirementKey;
  label: string;
  /** Current value and target, already formatted (no target for yes/no requirements). */
  have: string;
  need: string;
  ok: boolean;
};

export type Readiness = { level: ItmLevel; ready: boolean; requirements: Requirement[] };

export type ReadinessMetrics = {
  longest: number;
  backToBack: number;
  accumulated: number;
  nights: number;
  sleptOut: number;
  support: number;
  races: { date: DateOnly; key: ItmKey }[];
};

export type ReadinessOptions = EngineOptions & { locale?: LocaleInput | undefined };

/** Metrics of the windows that end on `date`. */
export function readinessMetrics(input: ReadinessInput, date: DateOnly): ReadinessMetrics {
  const since12w = addDays(date, -84);
  const since12m = addDays(date, -365);
  const since24m = addDays(date, -730);
  const win = input.sessions.filter((s) => s.date > since12w && s.date <= date);
  const byDay = new Map<DateOnly, number>();
  for (const s of win) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.effort);
  let backToBack = 0;
  for (const [d, e] of byDay) {
    const next = byDay.get(addDays(d, 1));
    if (next !== undefined) backToBack = Math.max(backToBack, e + next);
  }
  const lastYear = input.sessions.filter((s) => s.date > since12m && s.date <= date);
  // 8-week average: the 8 full previous weeks or the 7 previous plus the current one, whichever is higher, so a
  // Monday (a new, still empty week) does not make the average drop at once.
  const thisWeek = weekStart(date);
  const sumWeeks = (from: DateOnly, to: DateOnly) =>
    input.supportWeeks.filter((w) => w.week >= from && w.week <= to).reduce((sum, w) => sum + w.count, 0);
  const supportTotal = Math.max(
    sumWeeks(addDays(thisWeek, -56), addDays(thisWeek, -7)),
    sumWeeks(addDays(thisWeek, -49), thisWeek),
  );
  return {
    longest: Math.max(0, ...[...byDay.values()]),
    backToBack,
    accumulated: win.reduce((sum, s) => sum + s.effort, 0),
    nights: lastYear.filter((s) => s.night).length,
    sleptOut: lastYear.filter((s) => s.sleptOut).length,
    support: supportTotal / 8,
    races: input.races.filter((r) => r.date > since24m && r.date <= date),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Readiness for one category on a date, with every requirement and whether it is met. */
export function readinessFor(
  key: ItmKey,
  date: DateOnly,
  itm: number,
  input: ReadinessInput,
  options: ReadinessOptions = {},
): Readiness {
  return readinessWith(makeEngine(options), key, date, itm, input, options.locale);
}

export function readinessWith(
  e: Engine,
  key: ItmKey,
  date: DateOnly,
  itm: number,
  input: ReadinessInput,
  localeInput?: LocaleInput,
  metrics: ReadinessMetrics = readinessMetrics(input, date),
): Readiness {
  const t = resolveLocale(localeInput).readiness;
  const code = resolveLocale(localeInput).code;
  const index = e.levels.findIndex((l) => l.key === key);
  const level = e.levels[index]!;
  const rule = e.config.readiness[key];
  const m = metrics;
  const modded = e.mods.length > 0;
  const threshold = modded ? round2(thresholdsOn(e, date)[index]!) : level.threshold;
  const adj = modded ? readinessAdjustment(e.mods, e.athlete, key, date, m) : null;
  // Without modifiers the rule is used as is (no arithmetic at all), so outputs match the reference exactly.
  const scaled = (k: "longest" | "backToBack" | "accumulated" | "support", v: number) =>
    adj ? round2(v * adj.scale[k]) : v;
  const longest = scaled("longest", rule.longest);
  const accumulated = scaled("accumulated", rule.accumulated);
  const reqs: Requirement[] = [
    { key: "itm", label: t.itm, have: `${Math.round(itm)}`, need: `${threshold}`, ok: itm >= threshold },
    {
      key: "longest",
      label: t.longest,
      have: t.kmEffort(Math.round(m.longest)),
      need: `${longest}`,
      ok: m.longest >= longest,
    },
  ];
  if (rule.backToBack) {
    const need = scaled("backToBack", rule.backToBack);
    reqs.push({
      key: "backToBack",
      label: t.backToBack,
      have: t.kmEffort(Math.round(m.backToBack)),
      need: `${need}`,
      ok: m.backToBack >= need,
    });
  }
  reqs.push({
    key: "accumulated",
    label: t.accumulated,
    have: t.kmEffort(Math.round(m.accumulated)),
    need: `${accumulated}`,
    ok: m.accumulated >= accumulated,
  });
  if (rule.nights)
    reqs.push({
      key: "nights",
      label: t.nights,
      have: `${m.nights}`,
      need: `${rule.nights}`,
      ok: m.nights >= rule.nights,
    });
  if (rule.sleptOut)
    reqs.push({
      key: "sleptOut",
      label: t.sleptOut,
      have: `${m.sleptOut}`,
      need: `${rule.sleptOut}`,
      ok: m.sleptOut >= rule.sleptOut,
    });
  if (rule.support) {
    const need = scaled("support", rule.support);
    reqs.push({
      key: "support",
      label: t.support,
      have: m.support.toLocaleString(code, { maximumFractionDigits: 1 }),
      need: need.toLocaleString(code),
      ok: m.support >= need,
    });
  }
  if (rule.previousRace) {
    const done = m.races.some((r) => rule.previousRace!.includes(r.key));
    reqs.push({
      key: "previousRace",
      label: t.previousRace(rule.previousRace.map((k) => e.levels.find((l) => l.key === k)!.label)),
      have: done ? t.yes : t.no,
      need: "",
      ok: done,
    });
  }
  // Extra keys are always "<modifier id>:<key>" (prefixed by the runtime).
  if (adj) reqs.push(...(adj.extra as Requirement[]));
  return { level, ready: reqs.every((r) => r.ok), requirements: reqs };
}

/** The highest category the athlete is ready for on a date (or null). */
export function readyFor(
  date: DateOnly,
  itm: number,
  input: ReadinessInput,
  options: ReadinessOptions = {},
): ItmLevel | null {
  return readyWith(makeEngine(options), date, itm, input, options.locale);
}

export function readyWith(
  e: Engine,
  date: DateOnly,
  itm: number,
  input: ReadinessInput,
  locale?: LocaleInput,
): ItmLevel | null {
  const metrics = readinessMetrics(input, date);
  let found: ItmLevel | null = null;
  for (const l of e.levels) if (readinessWith(e, l.key, date, itm, input, locale, metrics).ready) found = l;
  return found;
}

/** Category of a race from its km effort: the highest level whose `minEffort` it reaches (or null). */
export function raceKey(effort: number, config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG): ItmKey | null {
  let found: ItmKey | null = null;
  for (const l of makeEngine({ config }).levels) if (effort >= l.minEffort) found = l.key;
  return found;
}
