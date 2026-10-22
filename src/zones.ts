import { DEFAULT_ITM_CONFIG, type ItmConfig, type ItmKey } from "./config";
import { levels } from "./levels";
import { resolveLocale, type LocaleInput } from "./locales";

/**
 * Presentation only: ITM drawn as a mountain, one band per level, from the valley to the summit. Each band starts at
 * the threshold of its level. None of this changes the number.
 */
export type ZoneKey = "valley" | "forest" | "pines" | "meadows" | "ridges" | "summit";

export type Zone = {
  key: ZoneKey;
  name: string;
  tagline: string;
  /** ITM where the band starts. */
  from: number;
  /** Race category that opens the band (the valley has none). */
  level: ItmKey | null;
};

const BANDS: readonly [ZoneKey, ItmKey | null][] = [
  ["valley", null],
  ["forest", "20k"],
  ["pines", "50k"],
  ["meadows", "100k"],
  ["ridges", "100m"],
  ["summit", "utmb"],
];

/** The bands of a config, lowest first. */
export function zones(config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG, locale?: LocaleInput): Zone[] {
  const t = resolveLocale(locale).zones;
  const lv = levels(config);
  return BANDS.map(([key, level]) => ({
    key,
    ...t[key],
    from: level ? lv.find((l) => l.key === level)!.threshold : 0,
    level,
  }));
}

/** Band of an ITM value. */
export function zoneForItm(itm: number, bands: Zone[] = zones()): Zone {
  let found = bands[0]!;
  for (const z of bands) if (itm >= z.from) found = z;
  return found;
}

/** The next band up (null at the summit). */
export function nextZone(zone: Zone, bands: Zone[] = zones()): Zone | null {
  const i = bands.findIndex((z) => z.key === zone.key);
  return bands[i + 1] ?? null;
}

/** Band of a race category (`null` → the valley, for races below the 20K minimum). */
export function zoneForLevel(level: ItmKey | null, bands: Zone[] = zones()): Zone {
  return bands.find((z) => z.level === level) ?? bands[0]!;
}
