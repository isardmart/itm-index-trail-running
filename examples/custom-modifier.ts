// How to write and use a community modifier. In your project, import from "@isardtrail/itm".
// This file is type-checked in CI so the template never goes stale.
import { addDays, createItm, defineModifier, withParams, type ItmActivity } from "../src/index";

/**
 * Illustrative only (not evidence-based, not a built-in): short sleep over the last week slightly speeds up decay.
 * A real contribution needs references that support the mapping — see docs/MODIFIERS.md and CONTRIBUTING.md.
 */
export const sleepExample = defineModifier<{ minHours: number; perHour: number; maxExtra: number }>({
  id: "sleep-example",
  version: "0.1.0",
  name: "Sleep (example)",
  description: "Illustrative template: less than minHours of sleep on average slightly speeds up decay.",
  references: ["https://github.com/isardmart/itm-index-trail-running/blob/main/docs/MODIFIERS.md"],
  inputs: [{ source: "series", field: "sleepHours", description: "Hours slept each night." }],
  params: {
    minHours: { default: 7, min: 5, max: 9, unit: "h", description: "Below this, decay rises." },
    perHour: { default: 0.02, min: 0, max: 0.05, description: "Extra decay per missing hour." },
    maxExtra: { default: 0.05, min: 0, max: 0.1, description: "Largest extra decay." },
  },
  hooks: {
    decayMultiplier(_day, athlete, _state, p) {
      const week = athlete.series.window("sleepHours", 7);
      if (week.length < 4) return 1; // not enough data: neutral
      const mean = week.reduce((a, b) => a + b, 0) / week.length;
      return 1 + Math.min(p.maxExtra, Math.max(0, p.minHours - mean) * p.perHour);
    },
  },
});

const activities: ItmActivity[] = [
  { date: "2026-06-01", type: "trail_run", distance_m: 25_000, elevation_gain_m: 1200 },
  { date: "2026-06-04", type: "strength", distance_m: null, elevation_gain_m: null },
];
const sleepHours = Array.from({ length: 30 }, (_, i) => ({ date: addDays("2026-06-01", i), value: 6 }));

// `withParams` checks the overrides against the modifier's params: `{ minHour: 6 }` would not compile.
const itm = createItm({
  modifiers: [withParams(sleepExample, { minHours: 6.5 })],
  athlete: { series: { sleepHours } },
});
export const series = itm.simulateItm(activities, "2026-06-30");
