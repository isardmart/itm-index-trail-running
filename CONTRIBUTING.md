# Contributing to ITM

Thanks for helping make ITM better. Bug reports, docs, translations and new variables are all welcome.

## Ground rules

- **Default results never change by accident.** With `DEFAULT_ITM_CONFIG` and no modifiers, ITM must stay identical
  to isardtrail.com. `test/golden.test.ts` and `test/history.test.ts` must stay green.
- **Privacy first.** No I/O, no network, no telemetry, no runtime dependencies. Personal data is always optional.
- **Never reward pain, injury, fasting or weight loss.** Proposals built around them are closed.
- Everything must pass `npm run check` (lint, typecheck, Prettier, tests with ≥ 90 % coverage, build).

## Development

```sh
npm install
npm run check
npm run smoke   # install from git into an empty folder and use it
```

Code style: strict TypeScript, ESLint and Prettier (`npm run format`). Keep the core pure: no `Date.now()`, no
randomness, no module-level mutable state.

## Proposing a new variable

1. **Open an issue** with the "New modifier proposal" template. It asks for:
   - **Hypothesis** — what the variable changes in ITM and why (effort, decay, thresholds or readiness).
   - **Evidence** — peer-reviewed studies or recognised guidelines, with DOI or URL, and how strong they are.
   - **Expected effect** — direction and size, with bounds (e.g. "+0–5 % effort above 25 °C").
   - **Data needed** — which athlete, series or activity fields, and how an app would obtain them locally.
2. Discuss it. A maintainer labels it `accepted`, `needs-evidence` or `declined`.
3. **Open a PR** with:
   - `src/modifiers/<id>.ts` using `defineModifier` (id, semver version, references, inputs, params with ranges, hooks);
   - its entry in `src/modifiers/registry.ts` (status `builtin`, off by default) and its export in `src/index.ts`;
   - `docs/modifiers/<id>.md`: what it does, evidence (every reference), params, limits;
   - tests in `test/` covering the effect, the no-op without data, bounds and causality.

Ideas that are promising but not yet supported well enough can land as a **proposal** doc in
`docs/modifiers/proposals/` (status `proposal` in the registry), like `heat` and `hrv`.

New inputs (a field not yet in `AthleteField`, `SeriesKey` or `ActivityField`) need a separate discussion, because they
widen what applications may collect.

## Review criteria for modifiers

| Criterion        | What reviewers check                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Evidence         | References are real, relevant and correctly cited; the mapping to ITM is justified and conservative         |
| Bounded effect   | Small default effect, params with tight ranges, sensible behaviour at the extremes (the core clamps anyway) |
| Privacy          | Minimal inputs, all optional; no inference of sensitive data; nothing leaves the process                    |
| Safety           | Cannot reward pain, injury, fasting, weight loss or unsafe exposure (e.g. extreme heat)                     |
| Parity untouched | Off by default; golden and calibration tests unchanged                                                      |
| Determinism      | Pure hooks, no clock or randomness, causal (only data up to the day)                                        |
| Docs and tests   | Doc page complete; tests for effect, no-op, bounds and causality                                            |

## Versioning (semver)

- **Major**: any change to default outputs (series, events, readiness or labels with defaults and no modifiers), to
  `DEFAULT_ITM_CONFIG`, or a breaking API change. Refresh `test/reference/` in the same PR and explain why.
- **Minor**: new modifiers, new locales, new optional inputs or API additions (default outputs unchanged).
- **Patch**: bug fixes that do not change default outputs, docs, internal refactors.

A modifier has its own `version`: bump its major when its outputs change for the same params.

## Translations

Add `src/locales/<code>.ts` implementing `ItmLocale`, register it in `src/locales/index.ts`, and add a test. Labels are
the only thing a locale may change.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
