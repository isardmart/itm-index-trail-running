# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org):
any change to default outputs is a major version (see [CONTRIBUTING.md](CONTRIBUTING.md#versioning-semver)).

## [1.0.0] — 2026-10-21

First release, extracted from the isardtrail.com engine
([ultra_trail_run@c871419](https://github.com/isardmart/ultra_trail_run/tree/c871419757a099c95c2957ff1463681e7f342157)).

### Added

- ITM engine: `simulateItm`, `itmOn`, `itmDeltas`, `itmEvents`, `nextItmLevel`, classification helpers, altitude.
- Config: `DEFAULT_ITM_CONFIG` (frozen), `mergeItmConfig`, `validateItmConfig`, `diffFromDefault`.
- `createItm({ config, patch, locale, modifiers, athlete })`: functions bound to an explicit config (replaces the
  website's `setItmConfig` live bindings).
- Readiness: `readinessMetrics`, `readinessFor`, `readyFor`, `raceKey`.
- Night runs and nights out: `isNightRun`, `sleptOutIds`.
- Strava: `stravaAltitude`, `stravaCategory`, `fromStravaActivity`.
- Presentation: `levels(config)`, `zones(config, locale)`, `zoneForItm`, `nextZone`, `zoneForLevel`.
- Locales: English (default) and Catalan.
- Modifier system with validation, clamping, causal athlete views and a body-mass guard; built-ins `age` and
  `carried-load` (off by default); `heat` and `hrv` proposals; `MODIFIER_REGISTRY`.
- Golden parity test against the frozen original engine; calibration test.
