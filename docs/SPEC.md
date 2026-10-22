# ITM · Isard Trail Meters — specification

This is the reference for how `@isardtrail/itm` computes ITM. It is derived from `docs/ITM.md` in
[isardmart/ultra_trail_run](https://github.com/isardmart/ultra_trail_run) (the isardtrail.com website), and it describes
the engine **exactly**: with `DEFAULT_ITM_CONFIG` and no modifiers, the package reproduces the website's numbers (see
[Parity](#11-parity)).

Everything here is pure and deterministic: no I/O, no clock, no global state. The config is always an explicit argument.

| Module                 | What it holds                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/config.ts`        | `ItmConfig`, `DEFAULT_ITM_CONFIG`, `mergeItmConfig`, `validateItmConfig`, `diffFromDefault`             |
| `src/engine.ts`        | `simulateItm`, gain/decay/support/altitude/cushion, `itmEvents`, `nextItmLevel`, classification helpers |
| `src/effort.ts`        | `kmEffort` (km + D+/100)                                                                                |
| `src/readiness.ts`     | "Ready for" a category: ITM + training requirements                                                     |
| `src/levels.ts`        | Level labels, colours, thresholds and derived weekly effort                                             |
| `src/zones.ts`         | Presentation: mountain bands (valley → summit) mapped to ITM thresholds                                 |
| `src/nightOut.ts`      | Night runs and nights out from Strava-like data (feeds readiness)                                       |
| `src/strava.ts`        | `stravaAltitude` ((elev_high + elev_low) / 2) and `fromStravaActivity`                                  |
| `src/dates.ts`         | `DateOnly` = `"YYYY-MM-DD"`; `isDateOnly`, `toDateOnly`, `addDays`, `daysBetween`, `weekStart` (Monday) |
| `src/createItm.ts`     | `createItm(options)`: all of the above bound to one config, locale, set of modifiers and athlete        |
| `src/modifiers/`       | The community variable system ([MODIFIERS.md](MODIFIERS.md))                                            |
| `test/golden.test.ts`  | Parity with the frozen original engine (`test/reference/`)                                              |
| `test/history.test.ts` | Calibration: ready for a 50K on 2026-09-05 (± 7 days), not a year earlier                               |

## 1. Idea

ITM measures **current trail-running fitness** as an altitude-like number. It answers "which race category could I run
now?", not "what should I run". It rises with running effort and decays every day without training, like a leaky
bucket. The value on a day depends only on what happened up to that day.

## 2. Unit: km effort

```
kmEffort = distance_km + elevation_gain_m / 100
```

20 km with 1,000 m D+ → 30 km effort. Missing values count as 0.

## 3. Levels (race categories)

Five levels, lowest to highest. Each has three configurable parameters:

| Key    | Label | threshold (ITM) | minEffort (km effort) | grace (days) | Colour    |
| ------ | ----- | --------------- | --------------------- | ------------ | --------- |
| `20k`  | 20K   | 110             | 20                    | 3            | `#f6dc2d` |
| `50k`  | 50K   | 250             | 45                    | 5            | `#f0782a` |
| `100k` | 100K  | 500             | 75                    | 7            | `#52c458` |
| `100m` | 100M  | 850             | 155                   | 14           | `#e0372f` |
| `utmb` | UTMB  | 1200            | 278                   | 21           | `#eef3f8` |

- **threshold**: ITM at which you have the fitness of that level.
- **minEffort**: km effort of a single run that "belongs" to that category (UTMB: 178 km + 10,000 m D+ = 278).
- **grace**: days without decay after a run of that category.
- Derived: `weekly = round(threshold × 7 × decay)`, the weekly km effort whose equilibrium is the threshold (20K → 15,
  UTMB → 168 with decay 0.02). `levels(config)` returns all of this.
- Labels and colours are not configurable (official UTMB category colours; UTMB itself is "ice white").
- Validation: thresholds and minEfforts must strictly increase from `20k` to `utmb`.

## 4. Configuration (`ItmConfig`) and defaults

| Field                     | Default | Meaning                                                                                    |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `decay`                   | 0.02    | Daily decay as a fraction of current ITM (2 %/day)                                         |
| `supportFactor`           | 0.5     | Strongest support brake: decay multiplied by this at full support                          |
| `supportFull`             | 2       | Support "charge" needed for the full brake (less charge → proportional brake)              |
| `supportHalfLife`         | 7       | Days for one support session to lose half its effect                                       |
| `supportWindow`           | 42      | Days (after the grace of the last category run) over which the support brake fades to zero |
| `cushion`                 | 0.8     | A level is lost only when ITM drops below `cushion × threshold`                            |
| `shortMinKm`              | 9       | Runs ≥ this distance without category are shown as "runs that add"                         |
| `homeAltitude`            | 12      | Altitude (m) of home on days without a stay (isardtrail.com: Barcelona)                    |
| `altitudeFrom`            | 1500    | Altitude (m) above which altitude has an effect (**isardtrail.com stores 1000**)           |
| `altitudeTrainingPer1000` | 0.15    | Extra fraction a run adds per 1,000 m above `altitudeFrom`…                                |
| `altitudeTrainingMax`     | 0.3     | …capped here (+30 %)                                                                       |
| `altitudeStayPer1000`     | 0.3     | Decay reduction per 1,000 m above `altitudeFrom` while sleeping at altitude…               |
| `altitudeStayMax`         | 0.5     | …capped here (half the decay)                                                              |
| `altitudeAfterDays`       | 14      | Days the stay effect lasts (fading linearly) after coming down                             |
| `levels`                  | table   | Section 3                                                                                  |
| `readiness`               | table   | Section 7                                                                                  |

Config handling:

- `mergeItmConfig(base, patch)`: partial patch, only provided fields change. For `readiness`, a field set to `null`
  removes that optional requirement.
- `validateItmConfig(c)`: list of human-readable errors (ranges per field; increasing thresholds and minEfforts).
  Ranges: decay 0.001–0.2, supportFactor 0–1, supportFull 0.5–20, supportHalfLife 1–60, supportWindow 1–365, cushion
  0.3–1, shortMinKm 0–100, homeAltitude −500–9000, altitudeFrom 0–9000, the per-1000 and max fields 0–1
  (altitudeStayMax 0–0.9), altitudeAfterDays 0–90, threshold 1–100000, minEffort 1–1000, grace 0–120, readiness
  longest 0–1000, accumulated 0–20000, backToBack 0–2000, nights/sleptOut 0–50, support 0–14, previousRace non-empty
  list of valid keys.
- `diffFromDefault(c)`: only the fields that differ from the defaults (what to store).
- **No global state.** The website used to call `setItmConfig(config)`, which mutated module-level live bindings. The
  package instead takes the config as an argument: `createItm({ config, patch })` returns functions bound to it, and
  every standalone function accepts `config` (default `DEFAULT_ITM_CONFIG`). `DEFAULT_ITM_CONFIG` is deeply frozen.
- `createItm` validates the config and throws `ItmConfigError` if it is invalid; so do the standalone functions when
  given a non-default config.

## 5. Inputs

```ts
type DateOnly = `${number}-${number}-${number}`; // "YYYY-MM-DD", local date; check strings with isDateOnly/toDateOnly
type ActivityType = "run" | "trail_run" | "hike" | "strength" | "swim" | "mobility" | "rest" | "other";

type ItmActivity = {
  date: DateOnly;
  type: ActivityType;
  distance_m: number | null;
  elevation_gain_m: number | null;
  altitude_m?: number | null; // from Strava: (elev_high + elev_low) / 2, clamped to −500..9000
  carriedLoadKg?: number | null; // modifiers only, never read by the core
  temperatureC?: number | null; // modifiers only, never read by the core
};

type AltitudeStay = { start: DateOnly; end: DateOnly; altitude_m: number }; // nights slept at altitude
type ItmBaseline = { date: DateOnly; itm: number }; // when the athlete started, and their ITM then
```

The **baseline** is per athlete. isardtrail.com uses `{ date: "2025-05-01", itm: 0 }`. Without a baseline, the package
starts at the first activity with ITM 0 (see [§12](#12-decisions-on-ambiguities)).

How isardtrail.com builds its activity list (for reference): all public completed activities, plus one synthetic
`strength` activity per private strength/mobility session (only the day is known, never the details). Health and
weight data are never an input of the core.

## 6. The daily simulation

`simulateItm(activities, until, { baseline, stays, config, modifiers, athlete })` → `ItmDay[]`.

Classification of a single activity:

- **Running** = `type` is `run` or `trail_run`.
- **Category run**: running and `kmEffort ≥ levels.20k.minEffort` (20). Its category is the highest level whose
  `minEffort` it reaches (`sessionCategory`). `qualifyingEffort(a)` returns its km effort, or null.
- **Short run that adds**: running, below category, and `distance ≥ shortMinKm` km (`shortRunEffort`). Only affects
  how it is shown; every non-category run adds its km effort anyway. `countedEffort` = category or short run.
- Anything else that is not `rest` (strength, mobility, swim, hike, other) and every non-category run is a **support**
  session.

Altitude:

```
above(alt)            = max(0, alt − altitudeFrom) / 1000
trainingBonus(alt)    = min(altitudeTrainingMax, above(alt) × altitudeTrainingPer1000)   // 0 if alt unknown
boosted(effort, act)  = effort × (1 + trainingBonus(act.altitude_m))
stayCut(alt)          = min(altitudeStayMax, above(alt) × altitudeStayPer1000)
altitudeStayCut(day)  = max over: stayCut(homeAltitude);
                         for each stay with stayCut > 0 and day ≥ start:
                           day ≤ end            → stayCut(stay.altitude)
                           k = days after end ≤ altitudeAfterDays → stayCut(stay.altitude) × (1 − k / (altitudeAfterDays + 1))
```

Loop, one iteration per calendar day from `start` to `until` inclusive, where `start` is the baseline date or the first
activity date if earlier (ITM starts at `baseline.itm` if starting on the baseline date, else 0):

```
keep = 0.5 ^ (1 / supportHalfLife)        // daily retention of support charge
state: itm, level = nextLevel(0, itm), support = 0, lastQual = null (date + grace of last category run)

for each day d:
  decay = 0
  if d > start:
    support = support × keep
    since = days since lastQual.date (∞ if none);  grace = lastQual.grace (0 if none)
    if since > grace:
      fade  = max(0, 1 − (since − grace) / supportWindow)
      brake = (1 − supportFactor) × min(1, support / supportFull) × fade
      decay = itm × decay × (1 − brake) × (1 − altitudeStayCut(d))
      decay = decay × M_decay(d)                                    // modifiers only, §10
  gain = 0
  for each activity a on d (in input order):
    if category run (effort e):
      gain += boosted(e, a) × M_effort(a, d)                        // M_effort = 1 without modifiers
      lastQual = { date: d, grace: category.grace }   // same day: keep the larger grace
    else if a.type ≠ "rest":
      if running: gain += boosted(kmEffort(a), a) × M_effort(a, d)
      support = min(support + 1, supportFull × 2)
  itm   = max(0, itm − decay + gain)
  level = nextLevel(level, itm, thresholds(d))                      // thresholds × M_threshold(d), §10
  emit { date: d, itm: round2(itm), level, gain, decay: round2(decay) }
```

Note that `gain` is emitted unrounded, while `itm` and `decay` are rounded to 2 decimals (the internal `itm` is not).

Level with cushion (`level` is 0 = none, 1 = 20K … 5 = UTMB):

```
nextLevel(level, itm):
  while level < 5 and itm ≥ thresholds[level]: level++
  while level > 0 and itm < thresholds[level − 1] × cushion: level--
```

Properties (each one is a test):

- Equilibrium: training W km effort every week settles ITM at about `W / (7 × decay)`.
- Grace: no decay for `grace` days after a category run; the longest grace wins on the same day.
- Support never increases ITM; it only slows decay, fades smoothly (half-life) and stops helping after `supportWindow`
  days without a category run.
- Altitude: a run below `altitudeFrom` gets no bonus; above it, linear up to the cap. Sleeping high reduces decay during
  the stay and fades linearly for `altitudeAfterDays`.
- Causality: adding future activities (or future athlete data) never changes past days.

Helpers built on the series:

- `itmOn(series, date)`: last known value (0 before the series starts).
- `itmDeltas(series)`: daily changes, rounded to 2 decimals, zeros skipped (used as "points").
- `itmEvents(series, activities, { locale })`: one `session` event per category run and per short run (delta =
  rounded gain), one `decay` event per Monday-week whose summed (rounded) decay is ≥ 1 (dated on the last decaying day
  of that week), and one `level` event per level change. Sorted by day (stable). A session label says "at altitude"
  when the core altitude bonus adds more than 0.5 km effort (other modifiers never change that label). The first day's
  level is the starting point, so a level reached on the first day does not produce an event.
- `nextItmLevel(itm)`: next level and `ceil(threshold − itm)` missing, or null at the top.

## 7. Readiness ("ready for" a category)

ITM is fitness only. **Ready** for a category = ITM ≥ its threshold **and** every requirement of that category, all
evaluated at a date: `readinessFor(key, date, itm, input)`; `readyFor(date, itm, input)` = highest ready category.

```ts
type ReadinessInput = {
  sessions: { date: DateOnly; effort: number; night: boolean; sleptOut: boolean }[]; // running sessions
  supportWeeks: { week: DateOnly; count: number }[]; // strength + mobility sessions per Monday-week
  races: { date: DateOnly; key: ItmKey }[]; // finished races and their category
};
```

Metrics at `date` (`readinessMetrics`), windows exclusive of their start and inclusive of `date`:

- `longest`: highest km effort of a single day (sessions of the same day are summed) in the last 84 days.
- `backToBack`: highest sum of two consecutive days in the last 84 days.
- `accumulated`: total km effort in the last 84 days.
- `nights` / `sleptOut`: count of sessions flagged so in the last 365 days.
- `support`: weekly average over 8 weeks = max(8 full previous weeks, 7 previous + current) / 8.
- `previousRace`: a finished race of one of the listed categories in the last 730 days.

Default rules:

| Key  | longest | backToBack | accumulated | nights | sleptOut | support /wk | previousRace          |
| ---- | ------- | ---------- | ----------- | ------ | -------- | ----------- | --------------------- |
| 20k  | 15      | –          | 150         | –      | –        | –           | –                     |
| 50k  | 30      | –          | 350         | –      | –        | –           | –                     |
| 100k | 50      | 60         | 650         | 1      | –        | 1           | 50k, 100k, 100m, utmb |
| 100m | 70      | 90         | 950         | 2      | 1        | 1.5         | 100k, 100m, utmb      |
| utmb | 90      | 110        | 1200        | 2      | 1        | 2           | 100k, 100m, utmb      |

Requirements are listed in this order: ITM, longest, backToBack, accumulated, nights, sleptOut, support, previousRace,
then any extra requirement from modifiers. An optional requirement whose value is `0` is treated as absent (as on the
site). `have` and `need` are pre-formatted strings in the chosen locale (support uses `toLocaleString`).

Race category: `raceKey(effort)` = highest level whose `minEffort` the race reaches (the website can also store a
manual level override per race).

Night and night-out detection (`nightOut.ts`, from Strava-like data):

- A **night run** has any part between 22:00 and 05:00 local time (`isNightRun(startLocal, elapsedS)`).
- A **night out** (`sleptOutIds`) is either (a) title/description mentions sleeping (dormir, bivac, refugi, acampada,
  tenda, sleep, camping…, accents and case ignored) and the activity lasts ≥ 10 h or spans 02:00, or (b) day one of a
  point-to-point two-day route: it ends ≥ 5 km from its start, after 15:00, and the next day an activity starts **by
  11:00** within 3 km of where it ended.
- Only the yes/no result is meant to be published.

## 8. Zones (presentation only)

`zones(config, locale)` draws ITM as a mountain. Each band starts at a level threshold: `valley` 0, `forest` 20K,
`pines` 50K, `meadows` 100K, `ridges` 100M, `summit` UTMB. Names and taglines are localised; the website's animal art
is not part of the package. A completed race goes to the band of its own category (`zoneForLevel(raceKey(effort))`).
None of this changes the number.

## 9. Calibration

The defaults were calibrated against a real public history (`test/history.fixture.ts`, ~130 runs from 2025-05-01 to
2026-09-05): with all defaults and baseline `{ date: "2025-05-01", itm: 0 }`, readiness for a 50K first becomes true
within ± 7 days of 2026-09-05 (a few weeks before the Ultra Pirineu 50K on 2026-10-03), and is false on 2025-09-05. Any
change to the formula must keep this test green.

## 10. Modifiers

Optional, community-contributed variables (age, carried load…). They are **off unless passed** and can only act
through four hooks whose results the core clamps:

| Hook                    | Where it acts                                         | Clamp                                |
| ----------------------- | ----------------------------------------------------- | ------------------------------------ |
| `effortMultiplier`      | `gain` of each running session (`M_effort`)           | each and product in [0.5, 1.5]       |
| `decayMultiplier`       | the day's decay after all core factors (`M_decay`)    | each and product in [0.5, 1.5]       |
| `thresholdMultiplier`   | level thresholds (levels, `nextItmLevel`, readiness)  | each and product in [0.5, 1.5]       |
| `readinessRequirements` | scales longest/backToBack/accumulated/support, extras | each scale and product in [0.5, 1.5] |

A modifier reading body mass may only use `effortMultiplier`, sees the highest body mass known so far, and is clamped to
[1, 1.1]. Category membership (`qualifyingEffort`, grace, support) always uses the raw km effort. Full rules in
[MODIFIERS.md](MODIFIERS.md).

## 11. Parity

With `DEFAULT_ITM_CONFIG`, no modifiers and the same inputs, the package returns the same daily series (`itm`, `level`,
`gain`, `decay`), the same events (with the `ca` locale, identical labels) and the same readiness as isardtrail.com.
`test/golden.test.ts` checks this with strict equality against a frozen copy of the original engine, on the real
fixture and on seeded random histories (stays, support sessions, rest days, same-day doubles), and also for the
live-site config (`altitudeFrom: 1000`) and random valid configs. Any change to default outputs is a **major** version.

## 12. Decisions on ambiguities

Points where `docs/ITM.md` was silent or loose, and how the package resolves them (always following the code):

1. **Default baseline.** The site hard-codes `{ date: "2025-05-01", itm: 0 }` (its athlete). The package has no
   athlete, so without a baseline it starts at the first activity with ITM 0 (or a single day at `until` with no
   activities). The site must pass its baseline explicitly.
2. **`homeAltitude` default 12 m and `altitudeFrom` default 1500.** Kept as the defaults for parity, even though they
   are site-specific (Barcelona; the live site stores 1000). An athlete profile's `homeAltitude` replaces
   `config.homeAltitude` when given.
3. **Rounding.** `itm` and `decay` are rounded to 2 decimals in the output only; `gain` is not rounded; weekly decay
   events sum the rounded daily decays.
4. **`longest` is per day**, not per session: two runs on the same day are summed (the code does this).
5. **Optional requirements equal to 0** are skipped (the site tests truthiness), so `nights: 0` = no requirement.
6. **Two-day route detection** requires the next-day start to be **by 11:00** (missing from the doc).
7. **Same-day order.** Activities of a day are processed in input order. Only gain sums and the max grace depend on
   them, so order does not change results (except for floating-point summation order, which matches the reference).
8. **First-day level change** produces no level event (the site's behaviour).
9. **`createItm` takes a full `config` and/or a `patch`.** A full config where an optional requirement is missing means
   "absent"; in a patch it means "unchanged". Keeping two fields avoids that ambiguity.
10. **Strava adapter.** `fromStravaActivity` returns `null` for categories the site does not import (rides, hikes,
    other), unless `includeAllCategories` is set — otherwise rides would silently count as support sessions.
11. **Zone keys** are English (`valley`, `forest`, `pines`, `meadows`, `ridges`, `summit`) instead of the site's
    Catalan keys (`vall`, `bosc`, `pineda`, `prats`, `crestes`, `cim`); boundaries are identical.
