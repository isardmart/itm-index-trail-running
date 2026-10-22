// Type-level tests: checked by `vitest --typecheck` and `tsc`, never executed. Each `@ts-expect-error` must fail to
// compile, so a change that loosens a public type breaks the build.
import { describe, expectTypeOf, it } from "vitest";
import {
  ITM_KEYS,
  ageModifier,
  createItm,
  defineModifier,
  isDateOnly,
  simulateItm,
  toDateOnly,
  validateAthleteProfile,
  validateModifier,
  withParams,
  type DateOnly,
  type ItmActivity,
  type ItmDay,
  type ItmKey,
  type LevelIndex,
  type ModifierUse,
} from "../src/index";

declare const fromJson: string;
declare const activities: ItmActivity[];

describe("dates", () => {
  it("accepts YYYY-MM-DD literals and rejects other strings", () => {
    expectTypeOf<"2026-10-21">().toExtend<DateOnly>();
    // @ts-expect-error not a date
    simulateItm(activities, "yesterday");
    // @ts-expect-error an unchecked string must go through isDateOnly / toDateOnly first
    simulateItm(activities, fromJson);
    expectTypeOf(toDateOnly(fromJson)).toEqualTypeOf<DateOnly>();
    if (isDateOnly(fromJson)) expectTypeOf(fromJson).toEqualTypeOf<DateOnly>();
  });
});

describe("levels and keys", () => {
  it("ItmKey is the closed set of categories", () => {
    expectTypeOf<ItmKey>().toEqualTypeOf<"20k" | "50k" | "100k" | "100m" | "utmb">();
    expectTypeOf(ITM_KEYS).toEqualTypeOf<readonly ["20k", "50k", "100k", "100m", "utmb"]>();
    // @ts-expect-error not a category
    createItm().readinessFor("10k", "2026-01-01", 0, { sessions: [], supportWeeks: [], races: [] });
  });
  it("a day's level is 0…5", () => {
    expectTypeOf<ItmDay["level"]>().toEqualTypeOf<LevelIndex>();
    expectTypeOf<LevelIndex>().toEqualTypeOf<0 | 1 | 2 | 3 | 4 | 5>();
  });
});

describe("activities", () => {
  it("only known activity types", () => {
    // @ts-expect-error "bike" is not an ActivityType
    simulateItm([{ date: "2026-01-01", type: "bike", distance_m: 1, elevation_gain_m: 0 }], "2026-01-01");
  });
});

describe("bound API", () => {
  it("methods can be destructured (no `this`)", () => {
    const { simulateItm: sim, readyFor } = createItm();
    expectTypeOf(sim).returns.toEqualTypeOf<ItmDay[]>();
    expectTypeOf(readyFor).toBeFunction();
  });
  it("is read-only", () => {
    const itm = createItm();
    // @ts-expect-error config cannot be reassigned
    itm.config = createItm().config;
    // @ts-expect-error nor changed in place
    itm.config.decay = 0.5;
  });
  it("rejects unknown config fields and wrong locales", () => {
    // @ts-expect-error typo in a config field
    createItm({ patch: { decai: 0.02 } });
    // @ts-expect-error unknown locale code
    createItm({ locale: "fr" });
  });
});

describe("modifiers", () => {
  it("hooks get typed params", () => {
    defineModifier<{ factor: number }>({
      id: "typed-example",
      version: "1.0.0",
      name: "Typed",
      description: "Typed params.",
      references: ["https://example.org"],
      inputs: [],
      params: { factor: { default: 1, min: 0.5, max: 1.5, description: "Factor." } },
      hooks: {
        decayMultiplier: (_day, _athlete, _state, p) => {
          expectTypeOf(p).toEqualTypeOf<Readonly<{ factor: number }>>();
          // @ts-expect-error params are read-only
          p.factor = 2;
          return p.factor;
        },
      },
    });
  });
  it("withParams checks overrides against the modifier", () => {
    expectTypeOf(withParams(ageModifier, { mastersFrom: 40 })).toEqualTypeOf<ModifierUse>();
    // @ts-expect-error unknown param
    withParams(ageModifier, { masterFrom: 40 });
    // @ts-expect-error wrong type
    withParams(ageModifier, { mastersFrom: "40" });
  });
  it("runtime validators accept anything", () => {
    expectTypeOf(validateModifier).parameter(0).toBeUnknown();
    expectTypeOf(validateAthleteProfile).parameter(0).toBeUnknown();
  });
});
