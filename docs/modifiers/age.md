# Age (masters grading)

**id:** `age` · **status:** builtin, off by default · **export:** `ageModifier` · **version:** 1.0.0

## What it does

For athletes older than `mastersFrom` (default 35):

1. **Age-graded thresholds** (`thresholdMultiplier`): every level threshold is multiplied by
   `max(thresholdFloor, 1 − thresholdPerYear × (age − mastersFrom))`. With the defaults, a 55-year-old reaches the 20K
   level at 99 ITM instead of 110 (×0.9), and nobody goes below ×0.8. The same scaled threshold is used for the level in
   the series, `nextItmLevel(itm, date)` and the ITM requirement of readiness.
2. **Slightly faster decay** (`decayMultiplier`): the day's decay is multiplied by
   `min(decayMax, 1 + decayPerDecade × (age − mastersFrom) / 10)`. With the defaults, ×1.06 at 55 and at most ×1.1.

Age is computed **on each day** from `birthDate` (full years), so a long history ages with the athlete. If only `age` is
given it is treated as constant. Without either, the modifier does nothing.

```ts
createItm({ modifiers: [ageModifier], athlete: { birthDate: "1971-05-01" } });
```

## Evidence

- **Endurance performance declines with age, slowly then faster.** In masters runners, performance is largely
  maintained until about 35 years, declines modestly (≈0.5–1 % per year) until 50–60, and more steeply afterwards,
  mainly through a fall in VO₂max. This is the basis of the threshold grading and of its default slope and floor.
  - Tanaka H, Seals DR. Endurance exercise performance in Masters athletes: age-associated changes and underlying
    physiological mechanisms. _J Physiol_ 2008;586(1):55–63. https://doi.org/10.1113/jphysiol.2007.141879
  - Tanaka H, Seals DR. Invited Review: Dynamic exercise performance in Masters athletes: insight into the effects of
    primary human aging on physiological functional capacity. _J Appl Physiol_ 2003;95(5):2152–2162.
    https://doi.org/10.1152/japplphysiol.00320.2003
- **Recovery and detraining.** Older athletes report and show slower recovery of muscle function after strenuous
  exercise, and training-induced adaptations are lost within weeks of stopping. Evidence that _detraining itself_ is
  faster with age is **limited and mixed**, so the decay effect is intentionally small (default 3 % per decade, capped
  at 10 %) and can be set to 0 (`decayPerDecade: 0`).
  - Fell J, Williams AD. The effect of aging on skeletal-muscle recovery from exercise: possible implications for aging
    athletes. _J Aging Phys Act_ 2008;16(1):97–115. https://doi.org/10.1123/japa.16.1.97
  - Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Part I.
    _Sports Med_ 2000;30(2):79–87. https://doi.org/10.2165/00007256-200030020-00002

## Params

| Param              | Default | Range   | Meaning                                          |
| ------------------ | ------- | ------- | ------------------------------------------------ |
| `mastersFrom`      | 35      | 30–60   | Age (years) from which the effects start         |
| `thresholdPerYear` | 0.005   | 0–0.015 | Threshold reduction per year above `mastersFrom` |
| `thresholdFloor`   | 0.8     | 0.5–1   | Lowest threshold multiplier                      |
| `decayPerDecade`   | 0.03    | 0–0.2   | Extra decay per decade above `mastersFrom`       |
| `decayMax`         | 1.1     | 1–1.5   | Highest decay multiplier                         |

The core clamps every multiplier to [0.5, 1.5] in any case.

## Limits

- Population averages, not individual physiology: the spread between masters athletes of the same age is large.
- Sex differences in age-related decline (reported in the literature) are not modelled.
- It changes what "ready" means for a masters athlete (graded thresholds). Applications should say so when it is on.
- It never uses body mass, health data or anything that could reward weight loss.
