# Modifiers — how to add a variable to ITM

The core ITM only needs running activities. **Modifiers** let the community add variables that make it more
personal — age, carried load, and in the future perhaps heat or HRV — **without touching the core** and without ever
changing the default results.

- Every modifier is **off** unless an application passes it in `modifiers`.
- A modifier whose inputs are missing is a **no-op**.
- With no modifiers, results are identical to isardtrail.com (the golden test guarantees it).

```ts
import { ageModifier, carriedLoadModifier, createItm } from "@isardtrail/itm";

const itm = createItm({
  modifiers: [ageModifier, { modifier: carriedLoadModifier, params: { maxBonus: 0.05 } }],
  athlete: { birthDate: "1975-03-14", bodyMassKg: 68 },
});
```

## Anatomy of a modifier

```ts
import { defineModifier } from "@isardtrail/itm";

export const sleepModifier = defineModifier<{ minHours: number; maxCut: number }>({
  id: "sleep", // kebab-case, unique
  version: "0.1.0", // semver of the modifier itself
  name: "Sleep",
  description: "Short sleep slightly speeds up decay.",
  references: ["doi:10.xxxx/xxxxx"], // peer-reviewed sources or guidelines: https URLs or DOIs
  inputs: [{ source: "series", field: "sleepHours", description: "Hours slept each night." }],
  params: {
    minHours: { default: 7, min: 5, max: 9, unit: "h", description: "Below this, decay rises." },
    maxCut: { default: 0.05, min: 0, max: 0.1, description: "Largest extra decay." },
  },
  hooks: {
    decayMultiplier(day, athlete, state, p) {
      const avg = athlete.series.window("sleepHours", 7);
      if (avg.length < 4) return 1; // not enough data: neutral
      const mean = avg.reduce((a, b) => a + b, 0) / avg.length;
      return 1 + Math.min(p.maxCut, Math.max(0, p.minHours - mean) * 0.02);
    },
  },
});
```

(An illustrative template only — `sleep` is not a built-in. See `examples/custom-modifier.ts`.)

| Field        | Rules                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `id`         | kebab-case, 2–40 chars, unique in a setup                                                         |
| `version`    | semver; bump the major when the modifier's outputs change for the same params                     |
| `references` | at least one; each an `https://` URL or a DOI (`doi:10.…` or `10.…`)                              |
| `inputs`     | the athlete/day fields it reads (see below); `required: false` for optional ones                  |
| `params`     | numbers with `default`, `min`, `max`, `description` (and `unit`); users may override within range |
| `hooks`      | one or more of the four hooks below                                                               |

`defineModifier` validates and deep-freezes the definition; `validateModifier` returns the list of errors instead.

### Inputs

| `source`   | Allowed `field`s                                                                       |
| ---------- | -------------------------------------------------------------------------------------- |
| `athlete`  | `age`, `sex`, `bodyMassKg`, `restingHr`, `maxHr`, `vo2max`, `homeAltitude`             |
| `series`   | `restingHr`, `sleepHours`, `hrvRmssd` (dated values)                                   |
| `activity` | `altitude_m`, `carriedLoadKg`, `temperatureC` (only meaningful for `effortMultiplier`) |

The athlete profile (`AthleteProfile`) is all optional: `birthDate` or `age`, `sex`, `bodyMassKg`, `restingHr`,
`maxHr`, `vo2max`, `homeAltitude`, and dated `series` (`restingHr`, `sleepHours`, `hrvRmssd`, `bodyMassKg`). It is
validated for plausible ranges; invalid data throws rather than silently producing a number.

A hook only sees the fields its modifier **declared**. If a required input is missing on a day (or, for activity
inputs, on that activity), the hook is not called and its multiplier is 1.

### Hooks

All hooks must be **pure and deterministic**: same arguments → same result, no I/O, no clock, no randomness, no
state kept between calls. Their arguments are frozen.

| Hook                                                    | Returns                      | Effect                                  |
| ------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| `effortMultiplier(activity, athlete, day, params)`      | multiplier                   | how much a running session adds         |
| `decayMultiplier(day, athlete, state, params)`          | multiplier                   | how fast fitness fades that day         |
| `thresholdMultiplier(levelKey, athlete, params)`        | multiplier                   | scales a level threshold (e.g. masters) |
| `readinessRequirements(levelKey, athlete, ctx, params)` | `{ scale?, extra? }` or null | adjusts or adds readiness requirements  |

- `athlete` is an `AthleteView` bound to the day: `age` on that day, declared static fields, and `series.latest(key,
maxAgeDays?)` / `series.window(key, days)` which **never return values dated after the day**.
- `state` (decay) is `{ itm, level, daysSinceCategoryRun, support }` before today's decay.
- `ctx` (readiness) is `{ date, metrics }` (the `readinessMetrics` of that date).
- `scale` may multiply `longest`, `backToBack`, `accumulated` and `support`. `extra` requirements are appended with
  their key prefixed by the modifier id (`"<id>:<key>"`); they can only make readiness harder.
- A hook that throws makes the whole computation throw an `ItmModifierError` naming the modifier — failures are loud.

## What the core enforces

These are enforced in code (`src/modifiers/runtime.ts`) and covered by `test/modifiers.test.ts`:

1. **Bounded effects.** Every multiplier, and the product of all modifiers for the same hook, is clamped to
   **[0.5, 1.5]**. Anything that is not a finite number becomes 1.
2. **Causality.** Hooks only receive data up to the current day; adding future activities or future series values
   never changes past days (tested with a modifier that tries to read everything).
3. **Body mass is only for normalising effort.** A modifier that declares `bodyMassKg`:
   - may only define `effortMultiplier` (validation rejects decay, threshold or readiness hooks);
   - sees the **highest body mass known so far** (profile value and series up to that day), so weight going down can
     never change a result;
   - is clamped to **[1, 1.1]**: it can add at most 10 %, and never penalise.
     Raw body-mass series are not an input any modifier can declare.
4. **Never reward pain, injury, fasting or weight loss.** No such input exists, and ids, names and params matching
   `pain|injur|fasting|weight loss|calorie|deficit|diet|starv` are rejected.
5. **Category membership is untouched.** Which runs count as category runs, their grace and the support charge use the
   raw km effort; modifiers only scale gain, decay, thresholds and requirements.
6. **Privacy.** The core never needs personal data, and the package performs no I/O: nothing is ever sent anywhere.
   An athlete profile lives only in the caller's memory.

## Registry

`MODIFIER_REGISTRY` lists every variable the project knows about, with its status and doc page:

| id             | status   | doc                                                        |
| -------------- | -------- | ---------------------------------------------------------- |
| `altitude`     | core     | [modifiers/altitude.md](modifiers/altitude.md)             |
| `age`          | builtin  | [modifiers/age.md](modifiers/age.md)                       |
| `carried-load` | builtin  | [modifiers/carried-load.md](modifiers/carried-load.md)     |
| `heat`         | proposal | [modifiers/proposals/heat.md](modifiers/proposals/heat.md) |
| `hrv`          | proposal | [modifiers/proposals/hrv.md](modifiers/proposals/hrv.md)   |

`getModifier(id)` returns a usable built-in. Proposals are documented ideas waiting for evidence and review.

## Proposing a new modifier

See [CONTRIBUTING.md](../CONTRIBUTING.md#proposing-a-new-variable). In short: open a "New modifier proposal" issue with
the hypothesis, the evidence, the expected effect and the data needed; then a PR with the modifier in
`src/modifiers/<id>.ts`, its entry in the registry, a doc page `docs/modifiers/<id>.md` (what it does, evidence,
params, limits) and tests. The registry test checks that the doc exists, cites every reference and documents every
param.
