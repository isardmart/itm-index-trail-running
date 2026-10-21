# Proposal: heart-rate variability (HRV)

**id:** `hrv` · **status:** proposal (not usable yet) · help wanted

A documented **template** for a future modifier. HRV-guided training has solid support, but HRV describes _readiness
to train today_ (autonomic state), not _fitness_. Mapping it onto ITM needs care, so it is not shipped yet.

## Hypothesis

A sustained drop of the morning HRV trend (e.g. 7-day rolling mean of ln RMSSD below the athlete's own baseline) signals
accumulated fatigue or illness. Two possible uses:

1. **Readiness:** an `extra` readiness requirement ("HRV trend within normal range") for the longest categories, as a
   caution signal — it can only make readiness harder.
2. **Decay:** _not_ proposed. A low HRV should never be turned into "you are losing fitness faster", and a high HRV
   should never inflate ITM.

## Evidence to start from

- Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite
  endurance athletes: opening the door to effective monitoring. _Sports Med_ 2013;43(9):773–781.
  https://doi.org/10.1007/s40279-013-0071-8
- Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP. Endurance training guided individually by daily heart rate
  variability measurements. _Eur J Appl Physiol_ 2007;101(6):743–751. https://doi.org/10.1007/s00421-007-0552-2
- Halson SL. Monitoring training load to understand fatigue in athletes. _Sports Med_ 2014;44(S2):139–147.
  https://doi.org/10.1007/s40279-014-0253-z

## Expected effect and bounds

- Readiness only, as an extra requirement; no effect on the ITM number.
- Requires a personal baseline (e.g. ≥ 14 days of data); with less data it is a no-op.

## Data needed

- `series.hrvRmssd`: one morning RMSSD value (ms) per day, measured the same way every day. Stays on the device of the
  application; the package never sends it anywhere.

## Open questions for reviewers

- Which window and threshold (e.g. rolling mean outside the smallest worthwhile change) are robust across devices?
- Should a caution signal be a requirement (blocking "ready") or only a note in the UI?

## Template

```ts
import { defineModifier } from "@isardtrail/itm";

export const hrvModifier = defineModifier<{ baselineDays: number; trendDays: number; maxDrop: number }>({
  id: "hrv",
  version: "0.1.0",
  name: "HRV trend",
  description: "Caution requirement when the morning HRV trend is well below the athlete's baseline.",
  references: ["doi:10.1007/s40279-013-0071-8", "doi:10.1007/s00421-007-0552-2"],
  inputs: [{ source: "series", field: "hrvRmssd", description: "Morning RMSSD (ms), daily." }],
  params: {
    baselineDays: { default: 28, min: 14, max: 90, unit: "days", description: "Window of the personal baseline." },
    trendDays: { default: 7, min: 3, max: 14, unit: "days", description: "Window of the current trend." },
    maxDrop: { default: 0.1, min: 0.03, max: 0.3, description: "Largest accepted drop of ln RMSSD vs. baseline." },
  },
  hooks: {
    readinessRequirements(level, athlete, _ctx, p) {
      if (level !== "100m" && level !== "utmb") return null;
      const ln = (xs: number[]) => xs.filter((x) => x > 0).map(Math.log);
      const base = ln(athlete.series.window("hrvRmssd", p.baselineDays));
      const trend = ln(athlete.series.window("hrvRmssd", p.trendDays));
      if (base.length < 14 || trend.length < 3) return null;
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const drop = 1 - mean(trend) / mean(base);
      return {
        extra: [
          { key: "trend", label: "HRV trend", have: `${Math.round(drop * 100)} %`, need: "", ok: drop <= p.maxDrop },
        ],
      };
    },
  },
});
```
