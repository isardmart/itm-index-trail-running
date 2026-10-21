# Altitude (core)

**Status:** core — always on, configured through `ItmConfig`, part of the calibrated defaults.

Altitude predates the modifier system and is part of the parity-tested engine, so it stays in the core rather than
being an `ItmModifier`. It is listed in the registry so that all variables are documented in one place.

## What it does

1. **Training at altitude adds more.** A run whose altitude (`altitude_m`; from Strava, the midpoint between its
   lowest and highest points) is above `altitudeFrom` adds `altitudeTrainingPer1000` extra per 1,000 m above it, up to
   `altitudeTrainingMax`.
2. **Sleeping at altitude slows decay.** During an `AltitudeStay`, the day's decay is cut by `altitudeStayPer1000` per
   1,000 m above `altitudeFrom`, up to `altitudeStayMax`. After coming down, the cut fades linearly over
   `altitudeAfterDays`. Home (`homeAltitude`, or the athlete's `homeAltitude`) applies on days without a stay.

Formulas: [SPEC.md §6](../SPEC.md#6-the-daily-simulation).

## Params (in `ItmConfig`)

| Field                     | Default | Range                               |
| ------------------------- | ------- | ----------------------------------- |
| `homeAltitude`            | 12      | −500–9000 m                         |
| `altitudeFrom`            | 1500    | 0–9000 m (isardtrail.com uses 1000) |
| `altitudeTrainingPer1000` | 0.15    | 0–1                                 |
| `altitudeTrainingMax`     | 0.3     | 0–1                                 |
| `altitudeStayPer1000`     | 0.3     | 0–1                                 |
| `altitudeStayMax`         | 0.5     | 0–0.9                               |
| `altitudeAfterDays`       | 14      | 0–90 days                           |

## Evidence

Living or training at moderate altitude produces haematological and non-haematological adaptations that fade over
roughly 2–3 weeks after returning to sea level; "live high" exposure is what drives them. The default numbers were
**calibrated** against a real history rather than derived from a model, and are deliberately modest.

- Chapman RF, Stray-Gundersen J, Levine BD. Individual variation in response to altitude training. _J Appl Physiol_
  1998;85(4):1448–1456. https://doi.org/10.1152/jappl.1998.85.4.1448
- Levine BD, Stray-Gundersen J. "Living high-training low": effect of moderate-altitude acclimatization with low-altitude
  training on performance. _J Appl Physiol_ 1997;83(1):102–112. https://doi.org/10.1152/jappl.1997.83.1.102

## Limits

- The altitude of an activity is an estimate (midpoint of its range), not time spent at each altitude.
- Stays are declared by the application; the package never infers where the athlete slept.
- Individual response to altitude varies widely (see Chapman et al.); the effect is capped for that reason.
