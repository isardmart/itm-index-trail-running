import type { ActivityType } from "./database.types";
import { addDays, daysBetween, weekStart, type DateOnly } from "./dates";
import { kmEffort } from "./effort";
import { DEFAULT_ITM_CONFIG, ITM_KEYS, type ItmConfig, type ItmKey } from "./itmConfig";

/**
 * ITM · Isard Trail Meters: la mesura de l'estat de forma per saber a quin nivell de cursa
 * s'està preparat (20K, 50K, 100K o 100M). No diu que s'hagi de córrer: diu que es podria.
 *
 *  - Guany: cada sortida de córrer suma els seus km esforç (km + D+/100). Les que arriben a 20 km esforç
 *    són «de categoria»: es marquen amb la seva categoria i tenen marge sense deteriorament.
 *  - Deteriorament: cada dia es perd un 2 % de l'ITM actual (com més amunt, més es perd en valor absolut).
 *  - Equilibri: mantenint cada setmana W km esforç, l'ITM s'estabilitza a W / (7 · 2 %). Els llindars de cada
 *    nivell són els d'una setmana tipus (de 15 km esforç per a la 20K a 168 per a l'UTMB). L'ITM és la forma;
 *    per estar «preparat» per a una categoria calen també els requisits de `readiness.ts`.
 *  - Marge sense deteriorament després d'una sortida de categoria (3 / 5 / 7 / 14 / 21 dies).
 *  - Les sortides de córrer de 9 km o més que no arriben a categoria també sumen (i es mostren) els seus km esforç,
 *    però no tenen marge: un marge propi inflava l'ITM i desajustava la calibració amb l'historial real.
 *  - Força, natació, mobilitat i sortides curtes frenen el deteriorament (a la meitat) unes setmanes.
 *  - Coixí: es puja de nivell en arribar al llindar, però només es baixa quan l'ITM cau un 20 % per sota.
 *  - Altitud: les sortides per sobre de 1.500 m sumen més, i dormir en altitud (una estada a la muntanya) frena el
 *    deteriorament mentre s'hi és i unes setmanes després (l'adaptació s'esvaeix a poc a poc). A casa, Barcelona.
 *
 * Tot és determinista i pur: el passat no canvia amb el futur.
 */

export type { ItmKey } from "./itmConfig";

export type ItmLevel = {
  key: ItmKey;
  label: string;
  /** Km esforç mínims d'una sortida d'aquesta categoria (la UTMB: 178 km + 10.000 m D+ = 278). */
  minEffort: number;
  /** Km esforç setmanals d'una setmana tipus d'aquest nivell. */
  weekly: number;
  /** ITM d'equilibri d'aquesta setmana tipus. */
  threshold: number;
  grace: number;
  color: string;
};

/**
 * Noms i colors de cada nivell (no es configuren): els oficials de les categories de l'UTMB (groc, taronja, verd i
 * vermell) i, per a l'UTMB, un blanc gel, el de la neu del cim, que no repeteix cap to del degradat.
 */
const LEVEL_LOOK: Record<ItmKey, { label: string; color: string }> = {
  "20k": { label: "20K", color: "#f6dc2d" },
  "50k": { label: "50K", color: "#f0782a" },
  "100k": { label: "100K", color: "#52c458" },
  "100m": { label: "100M", color: "#e0372f" },
  utmb: { label: "UTMB", color: "#eef3f8" },
};

/*
 * Els números surten de la configuració (`itmConfig.ts`), que es pot ajustar des de l'MCP. Són enllaços vius:
 * `setItmConfig` els canvia i qui els importa veu el valor nou.
 */
let config: ItmConfig = DEFAULT_ITM_CONFIG;
/** Mínim de km esforç perquè una sortida compti (el de la categoria 20K). */
export let ITM_MIN_EFFORT = 0;
/** Distància mínima (km) perquè una sortida de córrer sense categoria es mostri com a sortida que suma. */
export let ITM_SHORT_MIN_KM = 0;
/** Deteriorament diari, com a fracció de l'ITM. */
export let ITM_DECAY = 0;
/** Amb prou entrenament de suport recent, el deteriorament es multiplica per això (el fre màxim)… */
export let ITM_SUPPORT_FACTOR = 0;
/** …amb aquestes sessions recents (comptant que cada sessió es va esvaint)… */
export let ITM_SUPPORT_FULL = 0;
/** …i cada sessió perd la meitat del seu efecte en aquests dies. */
export let ITM_SUPPORT_HALF_LIFE = 0;
/** Dies (passat el marge de l'última sortida de categoria) en què el fre del suport s'apaga del tot. */
export let ITM_SUPPORT_WINDOW = 0;
/** Un nivell no es perd fins que l'ITM cau per sota d'aquesta fracció del seu llindar. */
export let ITM_CUSHION = 0;
/** Nivells de menor a major. */
export let ITM_LEVELS: ItmLevel[] = [];
/** L'ITM del cim de l'aventura: poder fer l'UTMB. */
export let ITM_SUMMIT = 0;
export let ITM_LEVEL_BY_KEY = new Map<ItmKey, ItmLevel>();

const listeners: (() => void)[] = [];

function apply(c: ItmConfig) {
  config = c;
  ITM_DECAY = c.decay;
  ITM_SUPPORT_FACTOR = c.supportFactor;
  ITM_SUPPORT_FULL = c.supportFull;
  ITM_SUPPORT_HALF_LIFE = c.supportHalfLife;
  ITM_SUPPORT_WINDOW = c.supportWindow;
  ITM_CUSHION = c.cushion;
  ITM_SHORT_MIN_KM = c.shortMinKm;
  ITM_LEVELS = ITM_KEYS.map((key) => {
    const l = c.levels[key];
    // Km esforç setmanals que mantenen l'ITM del llindar (equilibri: W ÷ (7 · deteriorament)).
    return { key, ...LEVEL_LOOK[key], ...l, weekly: Math.round(l.threshold * 7 * c.decay) };
  });
  ITM_MIN_EFFORT = ITM_LEVELS[0].minEffort;
  ITM_SUMMIT = ITM_LEVELS.at(-1)!.threshold;
  ITM_LEVEL_BY_KEY = new Map(ITM_LEVELS.map((l) => [l.key, l]));
}
apply(DEFAULT_ITM_CONFIG);

/** La configuració que s'està fent servir. */
export const getItmConfig = (): ItmConfig => config;

/** Canvia la configuració (si és diferent) i avisa els mòduls que en deriven valors (franges, colors…). */
export function setItmConfig(c: ItmConfig) {
  if (c === config || JSON.stringify(c) === JSON.stringify(config)) return;
  apply(c);
  for (const fn of listeners) fn();
}

/** Recalcula valors derivats quan canvia la configuració (i ara mateix). */
export function onItmConfig(fn: () => void) {
  listeners.push(fn);
  fn();
}

/** L'ITM comença a zero quan va començar el trail running (cap a maig de 2025). */
export const ITM_BASELINE = { date: "2025-05-01" as DateOnly, itm: 0 };

export type ItmActivity = {
  date: DateOnly;
  type: ActivityType;
  distance_m: number | null;
  elevation_gain_m: number | null;
  /** Altitud de la sortida (m), si es coneix. */
  altitude_m?: number | null;
};

/** Dies seguits dormint en altitud (una estada a la muntanya). Fora d'aquests dies, a casa. */
export type AltitudeStay = { start: DateOnly; end: DateOnly; altitude_m: number };

const aboveFrom = (altitude: number) => Math.max(0, altitude - config.altitudeFrom) / 1000;

/** Fracció de més que suma una sortida a aquesta altitud (0 per sota de l'altitud a partir de la qual compta). */
export function altitudeTrainingBonus(altitude: number | null | undefined): number {
  if (altitude == null || !Number.isFinite(altitude)) return 0;
  return Math.min(config.altitudeTrainingMax, aboveFrom(altitude) * config.altitudeTrainingPer1000);
}

const stayCut = (altitude: number) =>
  Math.min(config.altitudeStayMax, aboveFrom(altitude) * config.altitudeStayPer1000);

/**
 * Fracció en què es redueix el deteriorament d'un dia per dormir en altitud: la de l'estada mentre s'hi és, i
 * després va baixant fins a desaparèixer. Sense estades, la de casa (a Barcelona, cap).
 */
export function altitudeStayCut(date: DateOnly, stays: AltitudeStay[]): number {
  let best = stayCut(config.homeAltitude);
  for (const s of stays) {
    const full = stayCut(s.altitude_m);
    if (full <= 0 || date < s.start) continue;
    if (date <= s.end) best = Math.max(best, full);
    else {
      const k = daysBetween(s.end, date);
      if (k <= config.altitudeAfterDays) best = Math.max(best, full * (1 - k / (config.altitudeAfterDays + 1)));
    }
  }
  return best;
}

/** Km esforç que una sortida de córrer suma a l'ITM, amb el plus d'altitud. */
const boosted = (effort: number, a: Pick<ItmActivity, "altitude_m">) =>
  effort * (1 + altitudeTrainingBonus(a.altitude_m));

export type ItmDay = {
  date: DateOnly;
  itm: number;
  /** 0 = encara cap nivell; 1 = 20K … 4 = 100M (amb coixí). */
  level: number;
  gain: number;
  decay: number;
};

const isRun = (t: ActivityType) => t === "run" || t === "trail_run";

/** Km esforç d'una sortida si compta (córrer i ≥ 20), o null. */
export function qualifyingEffort(a: Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m">): number | null {
  if (!isRun(a.type)) return null;
  const e = kmEffort(a.distance_m, a.elevation_gain_m);
  return e >= ITM_MIN_EFFORT ? e : null;
}

/**
 * Km esforç d'una sortida de córrer de 9 km o més que no arriba a categoria (o null). Suma a l'ITM com qualsevol
 * sortida de córrer i es mostra amb els seus km esforç, però no porta xapa de categoria ni marge.
 */
export function shortRunEffort(a: Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m">): number | null {
  if (!isRun(a.type) || (a.distance_m ?? 0) < ITM_SHORT_MIN_KM * 1000) return null;
  return qualifyingEffort(a) === null ? kmEffort(a.distance_m, a.elevation_gain_m) : null;
}

/** Km esforç que una sortida de córrer aporta i es mostra (de categoria o de 9 km o més), o null. */
export function countedEffort(a: Pick<ItmActivity, "type" | "distance_m" | "elevation_gain_m">): number | null {
  return qualifyingEffort(a) ?? shortRunEffort(a);
}

/** Categoria d'una sortida que compta: la més alta amb un mínim de km esforç que s'hi arriba. */
export function sessionCategory(effort: number): ItmLevel | null {
  let found: ItmLevel | null = null;
  for (const l of ITM_LEVELS) if (effort >= l.minEffort) found = l;
  return found;
}

function nextLevel(level: number, itm: number): number {
  let l = level;
  while (l < ITM_LEVELS.length && itm >= ITM_LEVELS[l].threshold) l++;
  while (l > 0 && itm < ITM_LEVELS[l - 1].threshold * ITM_CUSHION) l--;
  return l;
}

/** Sèrie diària de l'ITM des de la línia de base (o la primera activitat, si és anterior) fins a `until`. */
export function simulateItm(
  activities: ItmActivity[],
  until: DateOnly,
  baseline: { date: DateOnly; itm: number } = ITM_BASELINE,
  stays: AltitudeStay[] = [],
): ItmDay[] {
  const byDate = new Map<DateOnly, ItmActivity[]>();
  for (const a of activities) byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  const first = [...byDate.keys()].sort()[0];
  const start = first && first < baseline.date ? first : baseline.date;

  const out: ItmDay[] = [];
  let itm = start === baseline.date ? baseline.itm : 0;
  let level = nextLevel(0, itm);
  let lastQual = null as { date: DateOnly; grace: number } | null;
  // Fre del suport: cada sessió el carrega i es va descarregant cada dia (sense salts).
  let support = 0;
  const keep = ITM_SUPPORT_HALF_LIFE > 0 ? 0.5 ** (1 / ITM_SUPPORT_HALF_LIFE) : 0;

  for (let d = start; d <= until; d = addDays(d, 1)) {
    const today = byDate.get(d) ?? [];
    let decay = 0;
    if (d > start) {
      support *= keep;
      const since = lastQual ? daysBetween(lastQual.date, d) : Infinity;
      const grace = lastQual?.grace ?? 0;
      if (since > grace) {
        // El suport sol no aguanta la forma per sempre: el fre s'apaga a poc a poc com més temps fa de l'última
        // sortida de categoria (sense salts).
        const fade = Math.max(0, 1 - (since - grace) / ITM_SUPPORT_WINDOW);
        const brake = (1 - ITM_SUPPORT_FACTOR) * Math.min(1, support / ITM_SUPPORT_FULL) * fade;
        decay = itm * ITM_DECAY * (1 - brake) * (1 - altitudeStayCut(d, stays));
      }
    }
    let gain = 0;
    for (const a of today) {
      const effort = qualifyingEffort(a);
      if (effort !== null) {
        gain += boosted(effort, a);
        const cat = sessionCategory(effort)!;
        lastQual = { date: d, grace: lastQual?.date === d ? Math.max(lastQual.grace, cat.grace) : cat.grace };
      } else if (a.type !== "rest") {
        if (isRun(a.type)) gain += boosted(kmEffort(a.distance_m, a.elevation_gain_m), a);
        support = Math.min(support + 1, ITM_SUPPORT_FULL * 2);
      }
    }
    itm = Math.max(0, itm - decay + gain);
    level = nextLevel(level, itm);
    out.push({ date: d, itm: Math.round(itm * 100) / 100, level, gain, decay: Math.round(decay * 100) / 100 });
  }
  return out;
}

/** ITM d'un dia (l'últim valor conegut, o 0 abans de començar). */
export function itmOn(series: ItmDay[], date: DateOnly): number {
  let v = 0;
  for (const s of series) {
    if (s.date > date) break;
    v = s.itm;
  }
  return v;
}

/** Variacions diàries (en ITM): sumar-les fins a un dia dona l'ITM d'aquell dia. */
export function itmDeltas(series: ItmDay[]): { day: DateOnly; points: number }[] {
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

const LEVEL_NAMES = ["Sense nivell", ...ITM_LEVELS.map((l) => l.label)];

/** Esdeveniments que expliquen la sèrie: sortides que sumen, deteriorament setmanal i canvis de nivell. */
export function itmEvents(series: ItmDay[], activities: ItmActivity[]): ItmEvent[] {
  const events: ItmEvent[] = [];
  type Counted = { effort: number; gain: number };
  const efforts = new Map<DateOnly, Counted[]>();
  const shorts = new Map<DateOnly, Counted[]>();
  for (const a of activities) {
    const e = qualifyingEffort(a);
    if (e !== null) efforts.set(a.date, [...(efforts.get(a.date) ?? []), { effort: e, gain: boosted(e, a) }]);
    const sh = shortRunEffort(a);
    if (sh !== null) shorts.set(a.date, [...(shorts.get(a.date) ?? []), { effort: sh, gain: boosted(sh, a) }]);
  }
  const high = (c: Counted) => (c.gain > c.effort + 0.5 ? " en altitud" : "");
  const weeks = new Map<DateOnly, { lost: number; last: DateOnly }>();
  let prevLevel = series[0]?.level ?? 0;
  for (const s of series) {
    for (const c of efforts.get(s.date) ?? []) {
      const cat = sessionCategory(c.effort)!;
      events.push({
        day: s.date,
        kind: "session",
        delta: Math.round(c.gain),
        label: `Sortida de categoria ${cat.label}${high(c)}`,
      });
    }
    for (const c of shorts.get(s.date) ?? []) {
      events.push({ day: s.date, kind: "session", delta: Math.round(c.gain), label: `Sortida de córrer${high(c)}` });
    }
    if (s.decay > 0) {
      const w = weekStart(s.date);
      const cur = weeks.get(w) ?? { lost: 0, last: s.date };
      weeks.set(w, { lost: cur.lost + s.decay, last: s.date });
    }
    if (s.level !== prevLevel) {
      events.push({
        day: s.date,
        kind: "level",
        delta: 0,
        label: s.level > prevLevel ? `Nivell ${LEVEL_NAMES[s.level]}` : `Baixa a ${LEVEL_NAMES[s.level]}`,
      });
      prevLevel = s.level;
    }
  }
  for (const w of weeks.values()) {
    if (w.lost >= 1)
      events.push({ day: w.last, kind: "decay", delta: -Math.round(w.lost), label: "Deteriorament de la setmana" });
  }
  return events.sort((a, b) => a.day.localeCompare(b.day));
}

/** Següent nivell per assolir (o null si ja som al cim) i quants ITM hi falten. */
export function nextItmLevel(itm: number): { level: ItmLevel; missing: number } | null {
  const level = ITM_LEVELS.find((l) => itm < l.threshold);
  return level ? { level, missing: Math.ceil(level.threshold - itm) } : null;
}
