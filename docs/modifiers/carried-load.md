# Carried load

**id:** `carried-load` · **status:** builtin, off by default · **export:** `carriedLoadModifier` · **version:** 1.0.0

## What it does

A run carrying a pack (`activity.carriedLoadKg`, e.g. mandatory kit for an ultra or a multi-day route) adds more:

```
effortMultiplier = 1 + min(maxBonus, costPerLoadFraction × carriedLoadKg / bodyMassKg)
```

With the defaults, 6 kg for a 75 kg runner adds 8 %; the bonus never exceeds 10 %. Without `carriedLoadKg` on the
activity, or without body mass, it does nothing.

```ts
createItm({ modifiers: [carriedLoadModifier], athlete: { bodyMassKg: 72 } });
// activities: { …, carriedLoadKg: 5 }
```

## Why body mass, and how it is guarded

This is the **only** legitimate use of body mass in ITM: to express a carried load relative to the body that carries
it. The core makes sure it can never turn into a reward for losing weight:

- the hook sees the **highest body mass known so far** (the profile value and every dated `bodyMassKg` up to that day),
  so weight going down never changes any result — tested with a falling weight series;
- a body-mass modifier may only use `effortMultiplier` (no decay, threshold or readiness hooks);
- its multiplier is clamped to **[1, 1.1]** by the core, whatever the hook returns;
- a body mass outside 20–250 kg is rejected as a data error.

## Evidence

- The metabolic cost of running rises nearly in proportion to added mass relative to body mass (adding 10 % of body
  mass raises net metabolic rate by roughly 10 %):
  - Teunissen LPJ, Grabowski A, Kram R. Effects of independently altering body weight and body mass on the metabolic
    cost of running. _J Exp Biol_ 2007;210(24):4418–4427. https://doi.org/10.1242/jeb.004481
- Load carriage energy cost models (walking) scale with load relative to body mass:
  - Pandolf KB, Givoni B, Goldman RF. Predicting energy expenditure with loads while standing or walking very slowly.
    _J Appl Physiol_ 1977;43(4):577–581. https://doi.org/10.1152/jappl.1977.43.4.577
  - Knapik JJ, Reynolds KL, Harman E. Soldier load carriage: historical, physiological, biomechanical, and medical
    aspects. _Mil Med_ 2004;169(1):45–56. https://doi.org/10.7205/MILMED.169.1.45

## Params

| Param                 | Default | Range | Meaning                                                      |
| --------------------- | ------- | ----- | ------------------------------------------------------------ |
| `costPerLoadFraction` | 1       | 0–1.5 | Extra effort per unit of load / body mass (1 = proportional) |
| `maxBonus`            | 0.1     | 0–0.1 | Largest extra fraction                                       |

## Limits

- The evidence is for running on flat or moderate terrain and walking; steep trail with a pack is not specifically
  modelled. The cap keeps the effect small.
- The load must be declared by the application (Strava does not record it).
- It never lowers effort: a heavier athlete is never penalised, and a lighter one never gets more than the cap.
