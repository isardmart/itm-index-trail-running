# ITM · Isard Trail Meters

**A free, open-source measure of trail-running fitness.** ITM turns your runs into one number that tells you which
race category you could run _now_ — 20K, 50K, 100K, 100M or UTMB — and what is still missing to be ready for it.

- It **rises** with what you run (distance and climbing), more for long runs and runs at altitude.
- It **fades** every day you don't train, a little slower if you keep doing strength and mobility, or sleep high.
- Being **ready** for a category takes fitness _and_ the right preparation: long runs, back-to-backs, volume, night
  runs, nights out and a previous race.
- It is **deterministic and causal**: the value on a day only depends on what happened up to that day.

ITM was created for [isardtrail.com](https://isardtrail.com) and is now a standalone TypeScript package. The community
can extend it with new, evidence-based variables (age, carried load, heat, HRV…) through a typed
[modifier system](docs/MODIFIERS.md) — without ever changing the default results.

The exact formulas are in [docs/SPEC.md](docs/SPEC.md).

## Install

Straight from GitHub (no npm publish needed; `prepare` builds `dist/` on install):

```sh
npm install github:isardmart/itm-index-trail-running
```

Pure TypeScript, **zero runtime dependencies**, ESM + CommonJS with type declarations. Node ≥ 20 and modern browsers.

## Usage

```ts
import { createItm } from "@isardtrail/itm";

const itm = createItm(); // defaults; createItm({ locale: "ca" }) for Catalan labels
const series = itm.simulateItm(activities, "2026-10-21", { baseline: { date: "2025-05-01", itm: 0 } });
const today = itm.itmOn(series, "2026-10-21");
console.log(today, itm.readyFor("2026-10-21", today, readinessInput)?.label);
```

where `activities` is a list of `{ date: "YYYY-MM-DD", type: "trail_run", distance_m, elevation_gain_m, altitude_m? }`
(see `fromStravaActivity` to convert Strava summaries) and `readinessInput` lists running sessions, weekly
strength/mobility counts and finished races. A runnable script is in [examples/](examples/print-series.mjs):

```sh
npm run build && node examples/print-series.mjs examples/activities.json
```

Every function is also exported standalone, taking the config as an argument: `simulateItm(activities, until,
{ baseline, stays, config, modifiers })`, `readinessFor(key, date, itm, input, { config })`, `kmEffort`, `itmEvents`,
`nextItmLevel`, `levels(config)`, `zones(config)`, `stravaAltitude`, `isNightRun`, `sleptOutIds`…

## Configuration

All numbers live in one plain `ItmConfig` object. The defaults (`DEFAULT_ITM_CONFIG`) are the calibrated ones and give
exactly the isardtrail.com results.

```ts
import { createItm, diffFromDefault, mergeItmConfig, validateItmConfig, DEFAULT_ITM_CONFIG } from "@isardtrail/itm";

const itm = createItm({ patch: { altitudeFrom: 1000, levels: { "50k": { threshold: 260 } } } });
const custom = mergeItmConfig(DEFAULT_ITM_CONFIG, { decay: 0.025 });
validateItmConfig(custom); // [] when valid
diffFromDefault(custom); // { decay: 0.025 } — what to store
```

There is no global state: the config is always an explicit argument, and two `createItm` instances never affect each
other. Invalid configs throw `ItmConfigError`.

## Modifiers (community variables)

Modifiers add optional variables to ITM. They are **all off by default**, do nothing when their data is missing, and
the core clamps every effect.

```ts
import { ageModifier, carriedLoadModifier, createItm } from "@isardtrail/itm";

const itm = createItm({
  modifiers: [ageModifier, carriedLoadModifier],
  athlete: { birthDate: "1975-03-14", bodyMassKg: 68 }, // all optional, local only
});
```

| Modifier       | Status   | What it does                                                          |
| -------------- | -------- | --------------------------------------------------------------------- |
| `altitude`     | core     | Runs at altitude add more; sleeping high slows decay (in `ItmConfig`) |
| `age`          | builtin  | Masters age grading of thresholds, slightly faster decay              |
| `carried-load` | builtin  | Runs with a pack add up to 10 % more                                  |
| `heat`, `hrv`  | proposal | Documented templates waiting for evidence                             |

Writing one: [docs/MODIFIERS.md](docs/MODIFIERS.md). Proposing one: [CONTRIBUTING.md](CONTRIBUTING.md).

Hard rules, enforced in code and tests: every multiplier is clamped to [0.5, 1.5]; modifiers cannot see future data;
ITM never rewards pain, injury, fasting or weight loss; body mass may only normalise effort (carried load), only ever
sees the highest value known so far, and is capped at +10 %.

## Privacy

- The core only needs running activities. It never needs personal or health data.
- The package does **no I/O and no network**: nothing is ever sent anywhere. Athlete data passed to modifiers stays in
  your process's memory.
- Every personal variable is optional, and an ITM can always be computed without it.
- Night-out detection reads titles, descriptions and coordinates only to return yes/no; publish the result, not the
  inputs.

## Parity with isardtrail.com

`test/golden.test.ts` runs the original website engine (a frozen copy in `test/reference/`) and this package side by
side on the real calibration history and on hundreds of seeded random histories, for the default config, the live
site config and random configs. With defaults and no modifiers the outputs are identical: series (`itm`, `decay`,
`level`, `gain`), events and readiness. Any change to default outputs is a **major** version.

## Development

```sh
npm install
npm run check   # lint, typecheck, format, tests with coverage, build
npm run smoke   # installs the package from git into an empty folder and uses it (ESM + CJS)
```

## Credits and licence

Created by **Isard Trail** ([isardtrail.com](https://isardtrail.com)). MIT licence — see [LICENSE](LICENSE).
