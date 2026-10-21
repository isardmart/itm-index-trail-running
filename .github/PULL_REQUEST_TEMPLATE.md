## What and why

<!-- What does this change, and why? Link the issue (for modifiers: the accepted proposal). -->

## Type

- [ ] Bug fix (no change to default outputs) — patch
- [ ] New modifier / locale / API addition (no change to default outputs) — minor
- [ ] Change to default outputs or breaking API — **major** (explain below and refresh `test/reference/`)
- [ ] Docs / tooling

## Checklist

- [ ] `npm run check` passes (lint, typecheck, format, tests with coverage ≥ 90 %, build)
- [ ] Golden parity (`test/golden.test.ts`) and calibration (`test/history.test.ts`) are untouched and green
- [ ] No runtime dependencies, no I/O, no network, no global mutable state
- [ ] CHANGELOG updated

### For a new modifier

- [ ] `src/modifiers/<id>.ts` with `defineModifier`, off by default, registered in `registry.ts` and exported
- [ ] `docs/modifiers/<id>.md`: what it does, evidence (every reference), params, limits
- [ ] Tests: effect, no-op without data, bounds, causality
- [ ] It cannot reward pain, injury, fasting or weight loss; body mass (if any) only normalises effort
