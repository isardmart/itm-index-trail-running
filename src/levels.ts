import { DEFAULT_ITM_CONFIG, ITM_KEYS, type ItmConfig, type ItmKey } from "./config";

export type ItmLevel = {
  key: ItmKey;
  label: string;
  /** Official UTMB category colour (UTMB itself is "ice white"). */
  color: string;
  /** ITM at which you have the fitness of this level. */
  threshold: number;
  /** Minimum km effort of a single run of this category (UTMB: 178 km + 10,000 m D+ = 278). */
  minEffort: number;
  /** Days without decay after a run of this category. */
  grace: number;
  /** Weekly km effort whose equilibrium is the threshold: `round(threshold × 7 × decay)`. */
  weekly: number;
};

/** Labels and colours are not configurable. */
export const LEVEL_LOOK: Readonly<Record<ItmKey, Readonly<{ label: string; color: string }>>> = Object.freeze({
  "20k": Object.freeze({ label: "20K", color: "#f6dc2d" }),
  "50k": Object.freeze({ label: "50K", color: "#f0782a" }),
  "100k": Object.freeze({ label: "100K", color: "#52c458" }),
  "100m": Object.freeze({ label: "100M", color: "#e0372f" }),
  utmb: Object.freeze({ label: "UTMB", color: "#eef3f8" }),
});

/** The five levels of a config, lowest to highest, with labels, colours, thresholds and the derived weekly effort. */
export function levels(config: Readonly<ItmConfig> = DEFAULT_ITM_CONFIG): ItmLevel[] {
  return ITM_KEYS.map((key) => {
    const l = config.levels[key];
    return {
      key,
      ...LEVEL_LOOK[key],
      threshold: l.threshold,
      minEffort: l.minEffort,
      grace: l.grace,
      weekly: Math.round(l.threshold * 7 * config.decay),
    };
  });
}
