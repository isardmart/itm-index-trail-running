import { defineModifier } from "./runtime";
import type { ItmModifier } from "./types";

export type CarriedLoadParams = { costPerLoadFraction: number; maxBonus: number };

/**
 * Carried load (pack, mandatory kit): a run carrying `carriedLoadKg` adds more, because the metabolic cost of running
 * rises roughly in proportion to the extra mass carried relative to body mass.
 *
 * This is the only legitimate use of body mass in ITM, and the core guards it: the hook only ever sees the highest
 * body mass known so far (losing weight can never raise ITM), its multiplier is capped at ×1.1, and a modifier that
 * reads body mass may not touch decay, thresholds or readiness. See docs/modifiers/carried-load.md.
 */
export const carriedLoadModifier: ItmModifier<CarriedLoadParams> = defineModifier<CarriedLoadParams>({
  id: "carried-load",
  version: "1.0.0",
  name: "Carried load",
  description: "Adds effort for runs with a pack, as a fraction of body mass, capped.",
  references: ["doi:10.1242/jeb.004481", "doi:10.1152/jappl.1977.43.4.577", "doi:10.7205/MILMED.169.1.45"],
  inputs: [
    { source: "activity", field: "carriedLoadKg", description: "Mass carried during the run (kg)." },
    {
      source: "athlete",
      field: "bodyMassKg",
      description: "Body mass (kg). The core passes the highest value known so far, never a lower one.",
    },
  ],
  params: {
    costPerLoadFraction: {
      default: 1,
      min: 0,
      max: 1.5,
      unit: "×",
      description: "Extra effort per unit of load / body mass (1 = proportional).",
    },
    maxBonus: { default: 0.1, min: 0, max: 0.1, unit: "fraction", description: "Largest extra fraction (≤ 10 %)." },
  },
  hooks: {
    effortMultiplier(activity, athlete, _day, p) {
      const load = Math.max(0, activity.carriedLoadKg!);
      return 1 + Math.min(p.maxBonus, (p.costPerLoadFraction * load) / athlete.bodyMassKg!);
    },
  },
});
