import type { MilestoneRow } from "./database.types";
import { kmEffort } from "./effort";
import { ITM_LEVELS, onItmConfig, type ItmKey } from "./itm";
import { raceKey } from "./readiness";

/**
 * L'ITM és altitud: cada nivell és una franja de la muntanya, de la vall al cim. El paisatge (i els animals que
 * s'hi veuen) canvia segons l'ITM de cada moment, de manera que si deixo d'entrenar també en baixo.
 */

export type ZoneKey = "vall" | "bosc" | "pineda" | "prats" | "crestes" | "cim";

export type Zone = {
  key: ZoneKey;
  name: string;
  /** ITM on comença la franja. */
  from: number;
  /** Categoria de cursa que obre la franja (la vall no en té). */
  level: ItmKey | null;
  tagline: string;
  /** L'animal que s'hi pot trobar. */
  animal: string;
};

const fromLevel = (key: ItmKey) => ITM_LEVELS.find((l) => l.key === key)!.threshold;

const buildZones = (): Zone[] => [
  {
    key: "vall",
    name: "La vall",
    from: 0,
    level: null,
    tagline: "Prats, rius i pobles. Tot comença aquí baix.",
    animal: "Vaques",
  },
  {
    key: "bosc",
    name: "El bosc",
    from: fromLevel("20k"),
    level: "20k",
    tagline: "Fagedes i rouredes: les primeres pujades llargues.",
    animal: "Cérvol",
  },
  {
    key: "pineda",
    name: "La pineda",
    from: fromLevel("50k"),
    level: "50k",
    tagline: "Pi negre i corriols drets. Aquí comencen les ultres.",
    animal: "Gall fer",
  },
  {
    key: "prats",
    name: "Els prats alpins",
    from: fromLevel("100k"),
    level: "100k",
    tagline: "Herba curta, estanys i el xiulet de les marmotes.",
    animal: "Marmota",
  },
  {
    key: "crestes",
    name: "Les crestes",
    from: fromLevel("100m"),
    level: "100m",
    tagline: "Roca, tartera i neu: el territori de l'isard.",
    animal: "Isard",
  },
  {
    key: "cim",
    name: "El cim",
    from: fromLevel("utmb"),
    level: "utmb",
    tagline: "Glacera i cel obert. El nivell de l'UTMB.",
    animal: "Trencalòs",
  },
];

/** Les franges, amb l'ITM on comença cadascuna (el llindar del seu nivell; canvia amb la configuració). */
export let ZONES: Zone[] = [];
export let ZONES_BY_KEY = new Map<ZoneKey, Zone>();
onItmConfig(() => {
  ZONES = buildZones();
  ZONES_BY_KEY = new Map(ZONES.map((z) => [z.key, z]));
});

/** Franja de la muntanya per a un ITM. */
export function zoneForItm(itm: number): Zone {
  let found = ZONES[0];
  for (const z of ZONES) if (itm >= z.from) found = z;
  return found;
}

/** La franja següent (null al cim). */
export function nextZone(zone: Zone): Zone | null {
  return ZONES[ZONES.indexOf(zone) + 1] ?? null;
}

type Placeable = Pick<MilestoneRow, "kind" | "distance_km" | "elevation_gain_m"> &
  Partial<Pick<MilestoneRow, "status" | "level">>;

/**
 * Nivell d'una cursa: el forçat a mà o, si no n'hi ha, el més alt dels mínims de km esforç (distància + desnivell
 * / 100, sense desnivell = 0) que la cursa supera. Per sota del mínim de la 20K, cap (la vall). Null si no és una cursa
 * o no en sabem la distància.
 */
export function raceLevel(m: Placeable): ItmKey | "vall" | null {
  if (m.kind !== "race") return null;
  if (m.level) return m.level;
  if (m.distance_km == null) return null;
  return raceKey(kmEffort(Number(m.distance_km) * 1000, m.elevation_gain_m ?? 0)) ?? "vall";
}

/** Franja que demana una fita: la del nivell d'una cursa, el cim per a la destinació. */
function zoneForMilestone(m: Placeable): Zone | null {
  if (m.kind === "destination") return ZONES.at(-1)!;
  const level = raceLevel(m);
  if (!level) return null;
  return level === "vall" ? ZONES[0] : ZONES.find((z) => z.level === level)!;
}

/**
 * Assigna una franja a cada fita (en l'ordre del camí). Cada cursa va a la franja del seu nivell (pels km esforç o
 * el forçat a mà), sigui quan sigui i estigui com estigui: feta, per fer o al radar. Les fites que no són curses
 * (competències, preparació) van a la franja de la cursa més exigent d'abans al camí.
 */
export function zoneOfEach<T extends Placeable>(milestones: T[]): { item: T; zone: Zone }[] {
  let current = ZONES[0];
  return milestones.map((item) => {
    const z = zoneForMilestone(item);
    if (z) {
      if (z.from > current.from) current = z;
      return { item, zone: z };
    }
    return { item, zone: current };
  });
}

/** Agrupa les fites per franja, de baix a dalt. Només les franges amb fites. */
export function groupByZone<T extends Placeable>(milestones: T[]): { zone: Zone; items: T[] }[] {
  const groups = new Map<ZoneKey, T[]>();
  for (const { item, zone } of zoneOfEach(milestones)) groups.set(zone.key, [...(groups.get(zone.key) ?? []), item]);
  return ZONES.filter((z) => groups.has(z.key)).map((zone) => ({ zone, items: groups.get(zone.key)! }));
}
