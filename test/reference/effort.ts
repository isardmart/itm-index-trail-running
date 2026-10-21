/**
 * Quilòmetre esforç: la mesura que fan servir les curses de muntanya per
 * comparar recorreguts. Cada 100 m de desnivell positiu compten com 1 km.
 *   20 km amb 1.000 m D+ → 20 + 10 = 30 km esforç.
 * Les categories segueixen les del circuit (20K, 50K, 100K, 100M).
 */

export type EffortCategory = "20k" | "50k" | "100k" | "100m";

export type EffortCategoryInfo = { key: EffortCategory; label: string; min: number; points: number };

/** De menor a major. `min` és el km esforç mínim per entrar a la categoria. */
export const EFFORT_CATEGORIES: EffortCategoryInfo[] = [
  { key: "20k", label: "20K", min: 25, points: 20 },
  { key: "50k", label: "50K", min: 45, points: 50 },
  { key: "100k", label: "100K", min: 75, points: 100 },
  { key: "100m", label: "100M", min: 155, points: 160 },
];

export const EFFORT_BY_KEY = new Map(EFFORT_CATEGORIES.map((c) => [c.key, c]));

export function kmEffort(distanceM: number | null | undefined, elevationGainM: number | null | undefined): number {
  return (distanceM ?? 0) / 1000 + (elevationGainM ?? 0) / 100;
}

/** Categoria assolida per una sortida, o null si no arriba a la més petita. */
export function effortCategory(kmEffortValue: number): EffortCategoryInfo | null {
  let found: EffortCategoryInfo | null = null;
  for (const c of EFFORT_CATEGORIES) if (kmEffortValue >= c.min) found = c;
  return found;
}

/** Posició de la categoria (0 = cap, 1 = 20K … 4 = 100M). Serveix per comparar reptes. */
export function effortLevel(kmEffortValue: number): number {
  const c = effortCategory(kmEffortValue);
  return c ? EFFORT_CATEGORIES.indexOf(c) + 1 : 0;
}
