import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BODY_MASS_MULTIPLIER_MAX,
  DEFAULT_ITM_CONFIG,
  ItmModifierError,
  MODIFIER_REGISTRY,
  MULTIPLIER_MAX,
  MULTIPLIER_MIN,
  addDays,
  ageModifier,
  carriedLoadModifier,
  clampMultiplier,
  createItm,
  defineModifier,
  getModifier,
  itmEvents,
  nextItmLevel,
  readinessFor,
  readyFor,
  simulateItm,
  validateAthleteProfile,
  validateModifier,
  type AthleteProfile,
  type ItmActivity,
  type ItmModifier,
  type ReadinessInput,
} from "../src/index";
import { generateHistory } from "./generator";
import { REAL_HISTORY } from "./history.fixture";

const baseline = { date: "2025-05-01", itm: 0 };
const run = (date: string, km: number, gain = 0, extra: Partial<ItmActivity> = {}): ItmActivity => ({
  date,
  type: "trail_run",
  distance_m: km * 1000,
  elevation_gain_m: gain,
  ...extra,
});

/** A minimal valid modifier; tests override pieces of it. */
const base = (over: Partial<ItmModifier> = {}): ItmModifier => ({
  id: "test-mod",
  version: "1.0.0",
  name: "Test",
  description: "A test modifier.",
  references: ["https://example.org/guideline"],
  inputs: [],
  params: { k: { default: 1, min: 0, max: 10, description: "k" } },
  hooks: { effortMultiplier: () => 1 },
  ...over,
});

describe("validation", () => {
  it("accepts the built-ins and a minimal modifier", () => {
    expect(validateModifier(ageModifier)).toEqual([]);
    expect(validateModifier(carriedLoadModifier)).toEqual([]);
    expect(validateModifier(base())).toEqual([]);
  });

  it("requires id, semver, name, description, references, hooks", () => {
    const errors = validateModifier(
      base({ id: "Bad Id", version: "1", name: "", description: " ", references: [], hooks: {} }),
    );
    expect(errors.join("\n")).toMatch(/kebab-case/);
    expect(errors.join("\n")).toMatch(/semver/);
    expect(errors.join("\n")).toMatch(/name is required/);
    expect(errors.join("\n")).toMatch(/description is required/);
    expect(errors.join("\n")).toMatch(/references must list/);
    expect(errors.join("\n")).toMatch(/at least one hook/);
  });

  it("references must be URLs or DOIs", () => {
    expect(validateModifier(base({ references: ["my blog"] }))[0]).toMatch(/https URL or a DOI/);
    expect(validateModifier(base({ references: ["10.1113/jphysiol.2007.141879", "doi:10.1/x"] }))).toHaveLength(1);
  });

  it("rejects unknown inputs, hooks and bad params", () => {
    const errors = validateModifier(
      base({
        inputs: [{ source: "athlete", field: "painScore" as "age", description: "" }],
        params: {
          k: { default: 5, min: 6, max: 10, description: "" },
          j: { default: NaN, min: 0, max: 1, description: "" },
        },
        hooks: { effortMultiplier: () => 1, rewardMe: () => 2 } as ItmModifier["hooks"],
      }),
    );
    expect(errors.join("\n")).toMatch(/athlete.painScore is not an allowed field/);
    expect(errors.join("\n")).toMatch(/unknown hook "rewardMe"/);
    expect(errors.join("\n")).toMatch(/param k: default must be within/);
    expect(errors.join("\n")).toMatch(/param j needs finite/);
    expect(validateModifier(base({ hooks: { effortMultiplier: 3 as unknown as () => number } }))[0]).toMatch(
      /must be a function/,
    );
    expect(
      validateModifier(base({ inputs: [{ source: "nowhere", field: "x" } as unknown as ItmModifier["inputs"][0]] })),
    ).toHaveLength(1);
  });

  it("never allows a variable built around pain, injury, fasting or weight loss", () => {
    for (const id of ["pain-bonus", "injury-adjust", "fasting-runs", "weight-loss", "calorie-deficit"])
      expect(validateModifier(base({ id })).join()).toMatch(/never rewards/);
    expect(
      validateModifier(base({ params: { weightLossPerWeek: { default: 0, min: 0, max: 1, description: "" } } })).join(),
    ).toMatch(/never rewards/);
    // Raw body-mass series are not an input a modifier can declare.
    expect(
      validateModifier(base({ inputs: [{ source: "series", field: "bodyMassKg" as "sleepHours", description: "" }] })),
    ).toHaveLength(1);
  });

  it("body mass may only normalise effort", () => {
    const m = base({
      inputs: [{ source: "athlete", field: "bodyMassKg", description: "" }],
      hooks: { effortMultiplier: () => 1, decayMultiplier: () => 0.5 },
    });
    expect(validateModifier(m).join()).toMatch(/body mass may only be used to normalise effort/);
  });

  it("createItm refuses invalid modifiers, duplicates and out-of-range params", () => {
    expect(() => createItm({ modifiers: [base({ references: [] })] })).toThrow(ItmModifierError);
    expect(() => createItm({ modifiers: [ageModifier, ageModifier] })).toThrow(/used twice/);
    expect(() => createItm({ modifiers: [{ modifier: ageModifier, params: { decayMax: 9 } }] })).toThrow(
      /between 1 and 1.5/,
    );
    expect(() => createItm({ modifiers: [{ modifier: ageModifier, params: { nope: 1 } }] })).toThrow(/unknown param/);
    expect(() => defineModifier(base({ version: "x" }))).toThrow(ItmModifierError);
  });

  it("validates the athlete profile", () => {
    expect(validateAthleteProfile(undefined)).toEqual([]);
    const errors = validateAthleteProfile({
      age: 300,
      sex: "x" as "male",
      birthDate: "1980-13-01",
      series: { sleepHours: [{ date: "2026-01-01", value: NaN }], stress: [] } as AthleteProfile["series"],
    });
    expect(errors).toHaveLength(5); // age, sex, birthDate, NaN entry, unknown series
    expect(() => createItm({ athlete: { bodyMassKg: 5 } })).toThrow(ItmModifierError);
  });

  it("the built-ins are frozen", () => {
    expect(Object.isFrozen(ageModifier)).toBe(true);
    expect(Object.isFrozen(ageModifier.params)).toBe(true);
    expect(() => {
      (ageModifier as { id: string }).id = "x";
    }).toThrow();
  });
});

describe("no modifiers, no data → exactly the core", () => {
  it("modifiers without their inputs are no-ops", () => {
    const plain = simulateItm(REAL_HISTORY, "2026-10-21", { baseline });
    const withMods = simulateItm(REAL_HISTORY, "2026-10-21", {
      baseline,
      modifiers: [ageModifier, carriedLoadModifier],
    });
    expect(withMods).toEqual(plain);
    // Partial data: body mass but no carried load on any activity → still a no-op.
    expect(
      simulateItm(REAL_HISTORY, "2026-10-21", {
        baseline,
        modifiers: [carriedLoadModifier],
        athlete: { bodyMassKg: 70 },
      }),
    ).toEqual(plain);
  });

  it("an empty modifier list or an empty profile is the core", () => {
    const h = generateHistory(5);
    const o = { baseline: h.baseline, stays: h.stays };
    expect(simulateItm(h.activities, h.until, { ...o, modifiers: [], athlete: {} })).toEqual(
      simulateItm(h.activities, h.until, o),
    );
  });
});

describe("clamping", () => {
  it("clampMultiplier bounds and neutralises non-numbers", () => {
    expect(clampMultiplier(100)).toBe(MULTIPLIER_MAX);
    expect(clampMultiplier(-3)).toBe(MULTIPLIER_MIN);
    expect(clampMultiplier(NaN)).toBe(1);
    expect(clampMultiplier(Infinity)).toBe(1);
    expect(clampMultiplier("2")).toBe(1);
    expect(clampMultiplier(1.2)).toBe(1.2);
  });

  it("an extreme effort multiplier is capped at ×1.5, and the product of many too", () => {
    const greedy = (id: string) => base({ id, hooks: { effortMultiplier: () => 1000 } });
    const acts = [run("2026-01-01", 30)];
    const one = simulateItm(acts, "2026-01-01", { modifiers: [greedy("a-greedy")] })[0]!;
    const three = simulateItm(acts, "2026-01-01", {
      modifiers: [greedy("a-greedy"), greedy("b-greedy"), greedy("c-greedy")],
    })[0]!;
    expect(one.gain).toBe(30 * MULTIPLIER_MAX);
    expect(three.gain).toBe(30 * MULTIPLIER_MAX);
    const stingy = base({ hooks: { effortMultiplier: () => 0 } });
    expect(simulateItm(acts, "2026-01-01", { modifiers: [stingy] })[0]!.gain).toBe(30 * MULTIPLIER_MIN);
  });

  it("decay and threshold multipliers are clamped too", () => {
    const fast = base({ hooks: { decayMultiplier: () => 50 } });
    const s0 = simulateItm([], "2026-01-02", { baseline: { date: "2026-01-01", itm: 100 } });
    const s1 = simulateItm([], "2026-01-02", { baseline: { date: "2026-01-01", itm: 100 }, modifiers: [fast] });
    expect(s1[1]!.decay).toBeCloseTo(s0[1]!.decay * MULTIPLIER_MAX, 6);
    const easy = base({ hooks: { thresholdMultiplier: () => 0.01 } });
    const itm = createItm({ modifiers: [easy] });
    expect(itm.nextItmLevel(0, "2026-01-01")!.missing).toBe(Math.ceil(110 * MULTIPLIER_MIN));
    expect(itm.nextItmLevel(0)!.missing).toBe(110);
  });

  it("a hook that throws fails loudly with the modifier id", () => {
    const broken = base({
      hooks: {
        effortMultiplier: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => simulateItm([run("2026-01-01", 30)], "2026-01-01", { modifiers: [broken] })).toThrow(
      /test-mod.effortMultiplier threw: boom/,
    );
    const brokenStr = base({
      hooks: {
        decayMultiplier: () => {
          throw "bad";
        },
      },
    });
    expect(() =>
      simulateItm([], "2026-01-03", { baseline: { date: "2026-01-01", itm: 50 }, modifiers: [brokenStr] }),
    ).toThrow(/threw: bad/);
  });
});

describe("causality and determinism", () => {
  /** A modifier that tries hard to read the future: every series, every window. */
  const snoop = base({
    id: "snoop",
    inputs: [
      { source: "series", field: "sleepHours", required: false, description: "" },
      { source: "series", field: "restingHr", required: false, description: "" },
      { source: "series", field: "hrvRmssd", required: false, description: "" },
      { source: "athlete", field: "age", required: false, description: "" },
    ],
    hooks: {
      effortMultiplier: (_a, athlete) => 1 + (athlete.series.latest("sleepHours") ?? 0) / 100,
      decayMultiplier: (_d, athlete, state) =>
        1 + athlete.series.window("restingHr", 3650).length / 1000 + state.support / 100 - (athlete.age ?? 0) / 1000,
      thresholdMultiplier: (_k, athlete) => 1 - athlete.series.window("hrvRmssd", 3650).length / 1000,
    },
  });

  const athleteUntil = (until: string): AthleteProfile => {
    const values = (n: number) =>
      Array.from({ length: 900 }, (_, i) => ({ date: addDays("2025-05-01", i), value: n + (i % 7) })).filter(
        (v) => v.date <= until,
      );
    return {
      birthDate: "1970-06-15",
      series: { sleepHours: values(6), restingHr: values(48), hrvRmssd: values(60) },
    };
  };

  it("adding future activities and future data never changes past days", () => {
    const cut = "2026-03-01";
    const pastActs = REAL_HISTORY.filter((a) => a.date <= cut);
    const opts = (until: string) => ({ baseline, modifiers: [snoop, ageModifier], athlete: athleteUntil(until) });
    const past = simulateItm(pastActs, cut, opts(cut));
    const full = simulateItm(REAL_HISTORY, "2026-10-21", opts("2027-12-31"));
    expect(full.slice(0, past.length)).toEqual(past);
  });

  it("on random histories too", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const h = generateHistory(seed);
      const cut = addDays(h.until, -40);
      const o = (u: string) => ({ baseline: h.baseline, stays: h.stays, modifiers: [snoop], athlete: athleteUntil(u) });
      const past = simulateItm(
        h.activities.filter((a) => a.date <= cut),
        cut,
        o(cut),
      );
      const full = simulateItm(h.activities, h.until, o(h.until));
      expect(full.slice(0, past.length), `seed ${seed}`).toEqual(past);
    }
  });

  it("same inputs → same outputs", () => {
    const o = { baseline, modifiers: [snoop, ageModifier], athlete: athleteUntil("2027-01-01") };
    expect(simulateItm(REAL_HISTORY, "2026-10-21", o)).toEqual(simulateItm(REAL_HISTORY, "2026-10-21", o));
  });

  it("hooks receive frozen inputs and only the fields they declared", () => {
    const seen: unknown[] = [];
    const spy = base({
      id: "spy",
      inputs: [{ source: "athlete", field: "vo2max", description: "" }],
      hooks: {
        effortMultiplier(activity, athlete, day) {
          seen.push(Object.isFrozen(activity), Object.isFrozen(athlete), Object.isFrozen(day));
          seen.push(Object.keys(athlete).sort().join(","));
          seen.push(athlete.series.latest("sleepHours"), athlete.series.window("sleepHours", 10));
          return 1;
        },
      },
    });
    simulateItm([run("2026-01-01", 30)], "2026-01-01", {
      modifiers: [spy],
      athlete: { vo2max: 55, age: 40, bodyMassKg: 70, series: { sleepHours: [{ date: "2026-01-01", value: 8 }] } },
    });
    expect(seen).toEqual([true, true, true, "series,vo2max", undefined, []]);
  });

  it("series views honour maxAgeDays and windows", () => {
    const got: unknown[] = [];
    const probe = base({
      id: "probe",
      inputs: [{ source: "series", field: "sleepHours", description: "" }],
      hooks: {
        effortMultiplier(_a, athlete) {
          got.push(athlete.series.latest("sleepHours", 2), athlete.series.latest("sleepHours", 10));
          got.push(athlete.series.window("sleepHours", 7));
          return 1;
        },
      },
    });
    const series = { sleepHours: [5, 6, 7].map((v, i) => ({ date: addDays("2026-01-01", i * 3), value: v })) };
    // Values on 01-01, 01-04, 01-07; the run is on 01-10.
    simulateItm([run("2026-01-10", 30)], "2026-01-10", { modifiers: [probe], athlete: { series } });
    expect(got).toEqual([undefined, 7, [6, 7]]);
    // Required series missing → the hook is not even called.
    got.length = 0;
    simulateItm([run("2026-01-10", 30)], "2026-01-10", { modifiers: [probe], athlete: {} });
    expect(got).toEqual([]);
  });
});

describe("body mass guard", () => {
  const acts = [run("2026-03-01", 30, 0, { carriedLoadKg: 6 })];
  const gainWith = (athlete: AthleteProfile, date = "2026-03-01") =>
    simulateItm(
      acts.map((a) => ({ ...a, date })),
      date,
      { modifiers: [carriedLoadModifier], athlete },
    )[0]!.gain;

  it("carried load adds a capped bonus", () => {
    expect(gainWith({ bodyMassKg: 75 })).toBeCloseTo(30 * (1 + 6 / 75), 10);
    const heavy = [run("2026-03-01", 30, 0, { carriedLoadKg: 40 })];
    expect(
      simulateItm(heavy, "2026-03-01", { modifiers: [carriedLoadModifier], athlete: { bodyMassKg: 60 } })[0]!.gain,
    ).toBe(30 * BODY_MASS_MULTIPLIER_MAX);
  });

  it("losing weight over time never raises ITM: the hook sees the highest mass so far", () => {
    const losing: AthleteProfile = {
      series: {
        bodyMassKg: [
          { date: "2026-01-01", value: 80 },
          { date: "2026-02-01", value: 74 },
          { date: "2026-02-20", value: 66 },
        ],
      },
    };
    const stable: AthleteProfile = { series: { bodyMassKg: [{ date: "2026-01-01", value: 80 }] } };
    expect(gainWith(losing)).toBe(gainWith(stable));
    expect(gainWith({ bodyMassKg: 70, ...losing })).toBe(gainWith({ bodyMassKg: 80 }));
    // Future weight (after the run) is invisible.
    expect(gainWith({ series: { bodyMassKg: [{ date: "2026-04-01", value: 50 }] } })).toBe(30);
  });

  it("even a malicious body-mass modifier can only add up to ×1.1 and cannot reward low mass", () => {
    const evil = base({
      id: "evil-mass",
      inputs: [{ source: "athlete", field: "bodyMassKg", description: "" }],
      hooks: { effortMultiplier: (_a, athlete) => 200 / athlete.bodyMassKg! },
    });
    const g = (athlete: AthleteProfile) =>
      simulateItm([run("2026-03-01", 30)], "2026-03-01", { modifiers: [evil], athlete })[0]!.gain;
    expect(g({ bodyMassKg: 50 })).toBe(30 * BODY_MASS_MULTIPLIER_MAX);
    const dropping: AthleteProfile = {
      series: {
        bodyMassKg: [
          { date: "2026-01-01", value: 90 },
          { date: "2026-02-28", value: 60 },
        ],
      },
    };
    expect(g(dropping)).toBe(g({ bodyMassKg: 90 }));
    // And it can never lower effort either (no penalty for being heavier).
    const reverse = base({
      id: "reverse-mass",
      inputs: [{ source: "athlete", field: "bodyMassKg", description: "" }],
      hooks: { effortMultiplier: () => 0.1 },
    });
    expect(
      simulateItm([run("2026-03-01", 30)], "2026-03-01", { modifiers: [reverse], athlete: { bodyMassKg: 70 } })[0]!
        .gain,
    ).toBe(30);
  });

  it("no modifier sees body mass unless it declared it", () => {
    let keys = "";
    const nosy = base({
      id: "nosy",
      inputs: [{ source: "athlete", field: "age", description: "" }],
      hooks: {
        effortMultiplier: (_a, athlete) => {
          keys = Object.keys(athlete).join(",");
          return 1;
        },
      },
    });
    simulateItm([run("2026-03-01", 30)], "2026-03-01", { modifiers: [nosy], athlete: { age: 40, bodyMassKg: 70 } });
    expect(keys).toBe("age,series");
  });
});

describe("age modifier", () => {
  const master: AthleteProfile = { birthDate: "1971-05-01" };

  it("young athletes: no effect", () => {
    const young = simulateItm(REAL_HISTORY, "2026-10-21", { baseline, modifiers: [ageModifier], athlete: { age: 30 } });
    expect(young).toEqual(simulateItm(REAL_HISTORY, "2026-10-21", { baseline }));
  });

  it("masters: lower thresholds (age-graded) and slightly faster decay, both bounded", () => {
    const itm = createItm({ modifiers: [ageModifier], athlete: master });
    // 55 years on 2026-05-01 → 20 years above 35 → 1 − 0.1 = 0.9 threshold multiplier; decay ×1.06.
    expect(itm.nextItmLevel(0, "2026-05-01")!.missing).toBe(Math.ceil(110 * 0.9));
    const plain = simulateItm([], "2026-05-03", { baseline: { date: "2026-05-01", itm: 300 } });
    const aged = itm.simulateItm([], "2026-05-03", { baseline: { date: "2026-05-01", itm: 300 } });
    expect(aged[1]!.decay).toBeCloseTo(plain[1]!.decay * 1.06, 2);
    // Very old: floors and caps hold.
    const old = createItm({ modifiers: [ageModifier], athlete: { age: 99 } });
    expect(old.nextItmLevel(0, "2026-05-01")!.missing).toBe(Math.ceil(110 * 0.8));
    const oldDecay = old.simulateItm([], "2026-05-02", { baseline: { date: "2026-05-01", itm: 300 } })[1]!.decay;
    expect(oldDecay).toBeCloseTo(plain[1]!.decay * 1.1, 2);
  });

  it("age changes with the date when birthDate is given (and is unknown before birth)", () => {
    const itm = createItm({ modifiers: [ageModifier], athlete: { birthDate: "1990-06-15" } });
    expect(itm.nextItmLevel(0, "2026-06-14")!.missing).toBe(110); // 35 years old: no effect yet
    expect(itm.nextItmLevel(0, "2027-06-15")!.missing).toBe(Math.ceil(110 * (1 - 2 * 0.005)));
    expect(itm.nextItmLevel(0, "1980-01-01")!.missing).toBe(110);
  });

  it("thresholds also move readiness, and levels in the series", () => {
    const input: ReadinessInput = { sessions: [], supportWeeks: [], races: [] };
    const r = readinessFor("20k", "2026-05-01", 100, input, { modifiers: [ageModifier], athlete: master });
    expect(r.requirements[0]).toMatchObject({ key: "itm", need: "99", ok: true });
    expect(readinessFor("20k", "2026-05-01", 100, input).requirements[0]).toMatchObject({ need: "110", ok: false });
    const levelAt = (o: object) =>
      simulateItm([run("2026-05-01", 30, 7000)], "2026-05-01", { baseline: { date: "2026-05-01", itm: 0 }, ...o })[0]!
        .level;
    expect(levelAt({})).toBe(0); // 100 < 110
    expect(levelAt({ modifiers: [ageModifier], athlete: master })).toBe(1); // 100 ≥ 99
  });
});

describe("readiness requirements hook", () => {
  const input: ReadinessInput = {
    sessions: [{ date: "2026-05-01", effort: 32, night: false, sleptOut: false }],
    supportWeeks: [{ week: "2026-04-27", count: 8 }],
    races: [],
  };
  const tougher = base({
    id: "tougher",
    hooks: {
      readinessRequirements: (key, _athlete, ctx) =>
        key === "50k"
          ? {
              scale: { longest: 1.2, accumulated: 9, backToBack: 1, support: 1 },
              extra: [{ key: "hills", label: "Hill reps", have: `${ctx.metrics.longest}`, need: "40", ok: false }],
            }
          : null,
    },
  });

  it("scales numeric requirements (clamped) and appends namespaced extra ones", () => {
    const r = readinessFor("50k", "2026-05-02", 300, input, { modifiers: [tougher] });
    const byKey = Object.fromEntries(r.requirements.map((q) => [q.key, q]));
    expect(byKey.longest!.need).toBe("36");
    expect(byKey.accumulated!.need).toBe(`${350 * MULTIPLIER_MAX}`);
    expect(byKey["tougher:hills"]).toMatchObject({ label: "Hill reps", have: "32", ok: false });
    expect(r.ready).toBe(false);
    const r20 = readinessFor("20k", "2026-05-02", 300, input, { modifiers: [tougher] });
    expect(r20.requirements.map((q) => q.key)).toEqual(["itm", "longest", "accumulated"]);
    expect(readyFor("2026-05-02", 300, input, { modifiers: [tougher] })).toBeNull();
  });

  it("scales back-to-back and support too", () => {
    const m = base({
      id: "b2b",
      hooks: { readinessRequirements: () => ({ scale: { backToBack: 0.5, support: 0.5 } }) },
    });
    const r = readinessFor("100k", "2026-05-02", 600, input, { modifiers: [m] });
    const byKey = Object.fromEntries(r.requirements.map((q) => [q.key, q]));
    expect(byKey.backToBack!.need).toBe("30");
    expect(byKey.support!.need).toBe("0.5");
  });

  it("rejects malformed extra requirements", () => {
    const bad = base({
      id: "bad-extra",
      hooks: { readinessRequirements: () => ({ extra: [{ key: 1 } as unknown as never] }) },
    });
    expect(() => readinessFor("50k", "2026-05-02", 300, input, { modifiers: [bad] })).toThrow(/invalid extra/);
  });
});

describe("events with modifiers", () => {
  it("session deltas include the effort factor; 'at altitude' only reflects the core bonus", () => {
    const acts = [run("2026-03-01", 30, 0, { carriedLoadKg: 6 })];
    const opts = { modifiers: [carriedLoadModifier], athlete: { bodyMassKg: 60 } };
    const series = simulateItm(acts, "2026-03-02", opts);
    const ev = itmEvents(series, acts, opts);
    expect(ev[0]).toMatchObject({ kind: "session", delta: 33, label: "Category run 20K" });
  });
});

describe("registry and docs", () => {
  it("every entry has a doc page; built-ins are usable and off by default", () => {
    for (const e of MODIFIER_REGISTRY) {
      expect(existsSync(new URL(`../${e.doc}`, import.meta.url)), e.doc).toBe(true);
      if (e.status === "builtin") {
        expect(getModifier(e.id)).toBe(e.modifier);
        expect(validateModifier(e.modifier!)).toEqual([]);
        const doc = readFileSync(new URL(`../${e.doc}`, import.meta.url), "utf8");
        for (const ref of e.modifier!.references)
          expect(doc, `${e.id} doc cites ${ref}`).toContain(ref.replace(/^doi:/, ""));
        for (const p of Object.keys(e.modifier!.params)) expect(doc, `${e.id} doc documents ${p}`).toContain(p);
      } else expect(getModifier(e.id)).toBeUndefined();
    }
    expect(createItm().config).toBe(DEFAULT_ITM_CONFIG);
    expect(nextItmLevel(0)!.missing).toBe(110);
  });
});
