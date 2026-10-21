import { defineModifier } from "./runtime";
import type { ItmModifier } from "./types";

export type AgeParams = {
  mastersFrom: number;
  thresholdPerYear: number;
  thresholdFloor: number;
  decayPerDecade: number;
  decayMax: number;
};

/**
 * Masters age grading. From `mastersFrom` years:
 *  - level thresholds go down by `thresholdPerYear` per year (never below `thresholdFloor`), in line with the
 *    well-documented age-related decline of endurance performance (~0.5–1 %/year from the mid-30s);
 *  - the daily decay goes up by `decayPerDecade` per decade (never above `decayMax`), a conservative proxy for the
 *    slower recovery and the harder maintenance of adaptations reported in older athletes.
 * Without `age` (or `birthDate`) it does nothing. See docs/modifiers/age.md.
 */
export const ageModifier: ItmModifier<AgeParams> = defineModifier<AgeParams>({
  id: "age",
  version: "1.0.0",
  name: "Age (masters grading)",
  description:
    "Scales level thresholds down and decay slightly up for masters athletes, following the age-related decline of endurance performance.",
  references: [
    "doi:10.1113/jphysiol.2007.141879",
    "doi:10.1152/japplphysiol.00320.2003",
    "doi:10.1123/japa.16.1.97",
    "doi:10.2165/00007256-200030020-00002",
  ],
  inputs: [
    { source: "athlete", field: "age", description: "Age in years on each day (from birthDate, or a fixed age)." },
  ],
  params: {
    mastersFrom: { default: 35, min: 30, max: 60, unit: "years", description: "Age from which the effects start." },
    thresholdPerYear: {
      default: 0.005,
      min: 0,
      max: 0.015,
      unit: "fraction/year",
      description: "Threshold reduction per year above mastersFrom.",
    },
    thresholdFloor: {
      default: 0.8,
      min: 0.5,
      max: 1,
      unit: "fraction",
      description: "Lowest threshold multiplier.",
    },
    decayPerDecade: {
      default: 0.03,
      min: 0,
      max: 0.2,
      unit: "fraction/decade",
      description: "Extra decay per decade above mastersFrom.",
    },
    decayMax: { default: 1.1, min: 1, max: 1.5, unit: "multiplier", description: "Highest decay multiplier." },
  },
  hooks: {
    thresholdMultiplier(_level, athlete, p) {
      const years = Math.max(0, athlete.age! - p.mastersFrom);
      return Math.max(p.thresholdFloor, 1 - years * p.thresholdPerYear);
    },
    decayMultiplier(_day, athlete, _state, p) {
      const decades = Math.max(0, athlete.age! - p.mastersFrom) / 10;
      return Math.min(p.decayMax, 1 + decades * p.decayPerDecade);
    },
  },
});
