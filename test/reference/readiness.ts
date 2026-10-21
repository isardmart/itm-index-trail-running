import { addDays, weekStart, type DateOnly } from "./dates";
import { ITM_LEVELS, getItmConfig, onItmConfig, type ItmKey, type ItmLevel } from "./itm";
import type { ReadinessRule } from "./itmConfig";

/**
 * «Preparat per a» una categoria = forma (ITM al llindar) + requisits de preparació. La forma sola no basta per a
 * una 100K, una 100M o l'UTMB: calen sortides llargues, doblets, acumulat, nit, mobilitat i experiència prèvia.
 * Tot es calcula fins a una data (el passat no canvia). Xifres calibrades amb l'historial d'Strava: a l'Ultra
 * Pirineu (50K, 3-10-2026) s'hi arribava preparat; el setembre de 2025, encara no.
 */

export type ReadinessSession = {
  date: DateOnly;
  /** Km esforç de la sortida de córrer. */
  effort: number;
  /** Ha corregut (part) de nit. */
  night: boolean;
  /** Ha dormit fora (bivac, refugi, ruta de més d'un dia). */
  sleptOut: boolean;
};

export type ReadinessInput = {
  /** Sortides de córrer públiques. */
  sessions: ReadinessSession[];
  /** Sessions de mobilitat i força per setmana (inici de setmana → nombre), també les privades. */
  supportWeeks: { week: DateOnly; count: number }[];
  /** Curses acabades i la seva categoria. */
  races: { date: DateOnly; key: ItmKey }[];
};

/** Requisits per categoria (de la configuració de l'ITM, ajustable des de l'MCP). */
export let READINESS_RULES: Record<ItmKey, ReadinessRule> = getItmConfig().readiness;
onItmConfig(() => {
  READINESS_RULES = getItmConfig().readiness;
});

const LABELS: Record<ItmKey, string> = { "20k": "20K", "50k": "50K", "100k": "100K", "100m": "100M", utmb: "UTMB" };

export type Requirement = {
  key: "itm" | "longest" | "backToBack" | "accumulated" | "nights" | "sleptOut" | "support" | "previousRace";
  label: string;
  /** Valor actual i objectiu, ja formatats (sense objectiu si és sí/no). */
  have: string;
  need: string;
  ok: boolean;
};

export type Readiness = { level: ItmLevel; ready: boolean; requirements: Requirement[] };

const round = (n: number) => Math.round(n);

/** Mètriques de la finestra que acaba a `date`. */
export function readinessMetrics(input: ReadinessInput, date: DateOnly) {
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
  // Mitjana de 8 setmanes: les 8 senceres d'abans o les 7 d'abans més l'actual, la que sigui més alta. Així un
  // dilluns (setmana nova, encara buida) no fa caure la mitjana de cop.
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

/** Preparació per a una categoria en una data, amb cada requisit i si es compleix. */
export function readinessFor(key: ItmKey, date: DateOnly, itm: number, input: ReadinessInput): Readiness {
  const level = ITM_LEVELS.find((l) => l.key === key)!;
  const rule = READINESS_RULES[key];
  const m = readinessMetrics(input, date);
  const reqs: Requirement[] = [
    { key: "itm", label: "Forma (ITM)", have: `${round(itm)}`, need: `${level.threshold}`, ok: itm >= level.threshold },
    {
      key: "longest",
      label: "Sortida més llarga (12 setmanes)",
      have: `${round(m.longest)} km esf.`,
      need: `${rule.longest}`,
      ok: m.longest >= rule.longest,
    },
  ];
  if (rule.backToBack)
    reqs.push({
      key: "backToBack",
      label: "Doblet: dos dies seguits",
      have: `${round(m.backToBack)} km esf.`,
      need: `${rule.backToBack}`,
      ok: m.backToBack >= rule.backToBack,
    });
  reqs.push({
    key: "accumulated",
    label: "Acumulat (12 setmanes)",
    have: `${round(m.accumulated)} km esf.`,
    need: `${rule.accumulated}`,
    ok: m.accumulated >= rule.accumulated,
  });
  if (rule.nights)
    reqs.push({
      key: "nights",
      label: "Sortides de nit (12 mesos)",
      have: `${m.nights}`,
      need: `${rule.nights}`,
      ok: m.nights >= rule.nights,
    });
  if (rule.sleptOut)
    reqs.push({
      key: "sleptOut",
      label: "Nit fora (12 mesos)",
      have: `${m.sleptOut}`,
      need: `${rule.sleptOut}`,
      ok: m.sleptOut >= rule.sleptOut,
    });
  if (rule.support)
    reqs.push({
      key: "support",
      label: "Mobilitat o força (per setmana, 8 setmanes)",
      have: m.support.toLocaleString("ca", { maximumFractionDigits: 1 }),
      need: rule.support.toLocaleString("ca"),
      ok: m.support >= rule.support,
    });
  if (rule.previousRace) {
    const done = m.races.some((r) => rule.previousRace!.includes(r.key));
    reqs.push({
      key: "previousRace",
      label: `Cursa acabada: ${rule.previousRace.map((k) => LABELS[k]).join(" o ")} (24 mesos)`,
      have: done ? "Sí" : "No",
      need: "",
      ok: done,
    });
  }
  return { level, ready: reqs.every((r) => r.ok), requirements: reqs };
}

/** La categoria més alta per a la qual s'està preparat en una data (o null). */
export function readyFor(date: DateOnly, itm: number, input: ReadinessInput): ItmLevel | null {
  let found: ItmLevel | null = null;
  for (const l of ITM_LEVELS) if (readinessFor(l.key, date, itm, input).ready) found = l;
  return found;
}

/** Categoria d'una cursa a partir dels seus km esforç. */
export function raceKey(effort: number): ItmKey | null {
  let found: ItmKey | null = null;
  for (const l of ITM_LEVELS) if (effort >= l.minEffort) found = l.key;
  return found;
}
