# Proposal: heat

**id:** `heat` · **status:** proposal (not usable yet) · help wanted

This is a documented **template** for a future modifier. It is not shipped because, although the physiology of heat is
well established, there is no validated way yet to map it onto ITM's two levers (effort and decay). A contribution
should close that gap with evidence before it becomes a built-in.

## Hypothesis

1. **Effort:** running in the heat costs more than the same km effort in temperate conditions, so a hot session could
   add a little more (`effortMultiplier` from `activity.temperatureC`).
2. **Acclimation:** repeated heat exposure (≈1–2 weeks of sessions in the heat) produces adaptations that fade in a few
   weeks; this matters for readiness for hot races, not for general fitness.

## Evidence to start from

- Racinais S, Alonso JM, Coutts AJ, et al. Consensus recommendations on training and competing in the heat. _Scand J
  Med Sci Sports_ 2015;25(S1):6–19. https://doi.org/10.1111/sms.12467

## Expected effect and bounds

- Effort: small (+0–10 %) above a threshold temperature (e.g. 25 °C), linear, capped. The core clamps to ×1.5 anyway.
- Never a decay reduction: heat is a stressor, not a substitute for training.
- Possibly a readiness `extra` requirement for races flagged as hot (needs a race attribute the package does not have
  yet).

## Data needed

- `activity.temperatureC` (mean air temperature during the activity). Strava's summary does not include it; it would
  come from the device or a weather lookup done **by the application**, never by the package (no network).

## Open questions for reviewers

- What dose–response between temperature (or WBGT) and running cost is robust enough to encode?
- Humidity matters as much as temperature: is `temperatureC` alone acceptable, or do we need a heat-index input?
- How to avoid rewarding unsafe heat exposure (cap, and no reward above a danger threshold)?

## Template

```ts
import { defineModifier } from "@isardtrail/itm";

export const heatModifier = defineModifier<{ fromC: number; perDegree: number; maxBonus: number }>({
  id: "heat",
  version: "0.1.0",
  name: "Heat",
  description: "Hot sessions add a little more effort.",
  references: ["doi:10.1111/sms.12467"],
  inputs: [{ source: "activity", field: "temperatureC", description: "Mean air temperature (°C)." }],
  params: {
    fromC: { default: 25, min: 15, max: 35, unit: "°C", description: "Temperature from which it applies." },
    perDegree: { default: 0.005, min: 0, max: 0.02, description: "Extra effort per °C above fromC." },
    maxBonus: { default: 0.05, min: 0, max: 0.1, description: "Largest extra fraction." },
  },
  hooks: {
    effortMultiplier(activity, _athlete, _day, p) {
      const over = Math.max(0, activity.temperatureC! - p.fromC);
      return 1 + Math.min(p.maxBonus, over * p.perDegree);
    },
  },
});
```
