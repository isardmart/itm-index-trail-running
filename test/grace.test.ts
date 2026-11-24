import { describe, expect, it } from "vitest";
import {
  DEFAULT_ITM_CONFIG,
  addDays,
  createItm,
  diffFromDefault,
  linearGraceDays,
  mergeItmConfig,
  simulateItm,
  validateItmConfig,
  type DateOnly,
  type ItmActivity,
  type ItmConfigPatch,
} from "../src/index";
import { REAL_HISTORY } from "./history.fixture";
import { generateHistory } from "./generator";

const START: DateOnly = "2026-01-01";
const baseline = { date: START, itm: 1000 } as const;
const LINEAR: ItmConfigPatch = { graceMode: "linear", speedGraceMax: 0 };
// supportFactor 1 switches the support brake off, so that the decay of a day is exactly 0, a fraction, or 1.
const cfg = (patch: ItmConfigPatch) => mergeItmConfig(DEFAULT_ITM_CONFIG, { supportFactor: 1, ...patch });

/** A flat run of `km` km (km effort = km), `kmh` km/h when it has moving time. */
const run = (date: DateOnly, km: number, kmh?: number): ItmActivity => ({
  date,
  type: "run",
  distance_m: km * 1000,
  elevation_gain_m: 0,
  ...(kmh === undefined ? {} : { moving_time_s: (km / kmh) * 3600 }),
});

const sim = (acts: ItmActivity[], patch: ItmConfigPatch, until: DateOnly) =>
  simulateItm(acts, until, { config: cfg(patch), baseline });

/** Decay of each day, as a fraction of the previous day's ITM over the plain 2 % (1 = full decay, 0 = grace). */
function factors(series: ReturnType<typeof sim>, from: DateOnly, days: number): number[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i + 1);
    const idx = series.findIndex((s) => s.date === d);
    const prev = series[idx - 1]!;
    return Math.round((series[idx]!.decay / (prev.itm * 0.02)) * 10) / 10;
  });
}

describe("graceMode", () => {
  it("defaults to levels, with every new number at its documented default", () => {
    expect(DEFAULT_ITM_CONFIG).toMatchObject({
      graceMode: "levels",
      graceMaxDays: 21,
      graceKmPerDay: 10,
      paceWindowDays: 56,
      paceMinRuns: 5,
      speedGraceMax: 0.3,
      speedGraceSlope: 2,
      speedPointsMax: 0,
    });
    expect(diffFromDefault(mergeItmConfig(DEFAULT_ITM_CONFIG, { graceMode: "linear", graceKmPerDay: 15 }))).toEqual({
      graceMode: "linear",
      graceKmPerDay: 15,
    });
  });

  it("validates the new fields", () => {
    expect(validateItmConfig(cfg({ graceMode: "linear" }))).toEqual([]);
    const bad = cfg({
      graceMode: "x" as never,
      graceKmPerDay: 0,
      paceMinRuns: 0,
      speedGraceMax: 2,
      speedPointsMax: -1,
    });
    const errors = validateItmConfig(bad).join("\n");
    for (const f of ["graceMode", "graceKmPerDay", "paceMinRuns", "speedGraceMax", "speedPointsMax"])
      expect(errors).toContain(f);
  });

  it("levels mode is identical to before, with or without moving time (even with speed settings)", () => {
    const withTime: ItmActivity[] = REAL_HISTORY.map((a) => ({
      ...a,
      moving_time_s: 3600 * (1 + (a.distance_m ?? 0) / 8000),
    }));
    const until: DateOnly = "2026-10-21";
    const before = simulateItm(REAL_HISTORY, until);
    expect(simulateItm(withTime, until)).toEqual(before);
    expect(
      simulateItm(withTime, until, {
        config: mergeItmConfig(DEFAULT_ITM_CONFIG, { speedGraceMax: 0.3, graceKmPerDay: 3 }),
      }),
    ).toEqual(before);
    for (const seed of [1, 2, 3]) {
      const { activities: acts } = generateHistory(seed);
      const timed = acts.map((a) => ({ ...a, moving_time_s: 4000 + (a.distance_m ?? 0) / 3 }));
      expect(simulateItm(timed, "2026-12-31")).toEqual(simulateItm(acts, "2026-12-31"));
    }
  });
});

describe("linear grace", () => {
  it("is causal on random histories, with speed on", () => {
    const patch: ItmConfigPatch = { graceMode: "linear", speedPointsMax: 0.2 };
    for (const seed of [4, 5]) {
      const { activities, baseline: b } = generateHistory(seed);
      const timed = activities.map((a, i) => ({ ...a, moving_time_s: 1800 + (a.distance_m ?? 0) / (2 + (i % 5) / 4) }));
      const cutDay = addDays(b.date, 200);
      const config = mergeItmConfig(DEFAULT_ITM_CONFIG, patch);
      const full = simulateItm(timed, addDays(cutDay, 150), { config, baseline: b });
      const past = timed.filter((a) => a.date <= cutDay);
      expect(simulateItm(past, cutDay, { config, baseline: b })).toEqual(full.filter((d) => d.date <= cutDay));
    }
  });

  it("gives min(21, effort / 10) days to every run, also those below 20 km effort", () => {
    const c = cfg(LINEAR);
    expect(linearGraceDays(19, c)).toBeCloseTo(1.9);
    expect(linearGraceDays(30, c)).toBe(3);
    expect(linearGraceDays(500, c)).toBe(21);
    // 19 km effort: levels mode gives nothing, linear gives 1 free day.
    const acts = [run("2026-01-10", 19)];
    expect(factors(sim(acts, {}, "2026-01-14"), "2026-01-10", 3)).toEqual([1, 1, 1]);
    expect(factors(sim(acts, LINEAR, "2026-01-14"), "2026-01-10", 3)).toEqual([0, 0.1, 1]);
  });

  it("km effort per day is configurable", () => {
    const acts = [run("2026-01-10", 30)];
    expect(factors(sim(acts, { ...LINEAR, graceKmPerDay: 15 }, "2026-01-14"), "2026-01-10", 4)).toEqual([0, 0, 1, 1]);
    expect(factors(sim(acts, LINEAR, "2026-01-14"), "2026-01-10", 4)).toEqual([0, 0, 0, 1]);
  });

  it("counts the fraction: 1.4 days = a free day, then the decay times (1 − 0.4)", () => {
    expect(factors(sim([run("2026-01-10", 14)], LINEAR, "2026-01-15"), "2026-01-10", 4)).toEqual([0, 0.6, 1, 1]);
  });

  it("does not run, hike or strength sessions? only run and trail_run give grace", () => {
    const hike: ItmActivity = { ...run("2026-01-10", 30), type: "hike" };
    expect(factors(sim([hike], LINEAR, "2026-01-12"), "2026-01-10", 2)).toEqual([1, 1]);
    const trail: ItmActivity = { ...run("2026-01-10", 30), type: "trail_run" };
    expect(factors(sim([trail], LINEAR, "2026-01-12"), "2026-01-10", 2)).toEqual([0, 0]);
  });

  it("graces do not add up: the latest end wins, each counted from its own day", () => {
    // A ends on day 10 (100 effort); B, inside it, would end on day 5: still day 10, not 13.
    const inside = [run("2026-01-10", 100), run("2026-01-13", 20)];
    expect(factors(sim(inside, LINEAR, "2026-01-22"), "2026-01-10", 12).join()).toBe(
      [...Array<number>(10).fill(0), 1, 1].join(),
    );
    // B ends later than A: the end is B's (day 1 + 3 = 4), not A's (2) nor their sum (5).
    const later = [run("2026-01-10", 20), run("2026-01-11", 30)];
    expect(factors(sim(later, LINEAR, "2026-01-17"), "2026-01-10", 6)).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it("is capped at 21 days, speed included", () => {
    const acts = [run("2026-01-10", 400)];
    const f = factors(sim(acts, LINEAR, "2026-02-15"), "2026-01-10", 24);
    expect(f.slice(0, 21).every((x) => x === 0)).toBe(true);
    expect(f.slice(21)).toEqual([1, 1, 1]);
    const timed = fastLast(400, 20, 7);
    const g = factors(sim(timed, { graceMode: "linear" }, "2026-03-31"), LAST, 24);
    expect(g.slice(0, 21).every((x) => x === 0)).toBe(true);
    expect(g[21]).toBe(1);
  });

  it("still gives the same category, events and readiness as before (only the decay changes)", () => {
    const acts = [run("2026-01-10", 50)];
    const levels = createItm();
    const linear = createItm({ patch: LINEAR });
    expect(linear.sessionCategory(50)?.key).toBe(levels.sessionCategory(50)?.key);
    expect(linear.qualifyingEffort(acts[0]!)).toBe(levels.qualifyingEffort(acts[0]!));
    expect(linear.simulateItm(acts, "2026-01-10", { baseline })[9]?.gain).toBe(
      levels.simulateItm(acts, "2026-01-10", { baseline })[9]?.gain,
    );
  });
});

// 6 runs of the usual pace (8 km/h), then a last one at `kmh` km/h and `km` km on LAST.
const LAST: DateOnly = "2026-02-20";
function fastLast(km: number, kmh: number, usualCount: number): ItmActivity[] {
  const usual = Array.from({ length: usualCount }, (_, i) => run(addDays("2026-01-02", i * 3), 10, 8));
  return [...usual, run(LAST, km, kmh)];
}

describe("fast runs", () => {
  const SPEED: ItmConfigPatch = { graceMode: "linear" }; // speedGraceMax 0.3, slope 2
  const free = (acts: ItmActivity[], patch: ItmConfigPatch) => factors(sim(acts, patch, "2026-03-20"), LAST, 8);

  it("faster than usual gives more grace, 1 + min(0.3, 2 × (pace / usual − 1))", () => {
    // usual 8 km/h, this run 8.8 km/h → ratio 0.1 → extra 0.2 → 30 km = 3 × 1.2 = 3.6 days.
    expect(free(fastLast(30, 8.8, 6), SPEED)).toEqual([0, 0, 0, 0.4, 1, 1, 1, 1]);
    expect(free(fastLast(30, 8.8, 6), LINEAR)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it("the extra has a ceiling (speedGraceMax) and 0 turns it off", () => {
    // Twice as fast: extra would be 2, capped at 0.3 → 3.9 days.
    expect(free(fastLast(30, 16, 6), SPEED)).toEqual([0, 0, 0, 0.1, 1, 1, 1, 1]);
    expect(free(fastLast(30, 16, 6), { ...SPEED, speedGraceMax: 0.1 })).toEqual([0, 0, 0, 0.7, 1, 1, 1, 1]);
    expect(free(fastLast(30, 16, 6), { ...SPEED, speedGraceMax: 0 })).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it("slower or equal to usual is exactly like a run without speed data", () => {
    for (const kmh of [8, 7, 3]) {
      const timed = fastLast(30, kmh, 6);
      const plain = timed.map((a) => ({ ...a, moving_time_s: null }));
      expect(sim(timed, SPEED, "2026-03-20")).toEqual(sim(plain, SPEED, "2026-03-20"));
    }
  });

  it("with fewer than 5 other runs in the window there is no extra", () => {
    // 4 usual runs + the fast one: the fast one has only 4 others.
    expect(free(fastLast(30, 16, 4), SPEED)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
    // 5 usual runs: now it counts.
    expect(free(fastLast(30, 16, 5), SPEED)).toEqual([0, 0, 0, 0.1, 1, 1, 1, 1]);
  });

  it("usual pace only looks at the last 56 days (and never at the run itself)", () => {
    const old = Array.from({ length: 6 }, (_, i) => run(addDays("2025-11-01", i * 3), 10, 8));
    const acts = [...old, run(LAST, 30, 16)];
    expect(free(acts, SPEED)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it("without moving time there is no extra", () => {
    const plain = fastLast(30, 16, 6).map((a) => ({ ...a, moving_time_s: null }));
    expect(free(plain, SPEED)).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
    expect(sim(plain, SPEED, "2026-03-20")).toEqual(sim(plain, LINEAR, "2026-03-20"));
  });

  it("speedPointsMax (off by default) adds the same extra to the km effort that count", () => {
    const acts = fastLast(30, 8.8, 6);
    const off = sim(acts, SPEED, LAST).at(-1)!;
    expect(sim(acts, { ...SPEED, speedPointsMax: 0 }, LAST).at(-1)).toEqual(off);
    const on = sim(acts, { ...SPEED, speedPointsMax: 0.3 }, LAST).at(-1)!;
    expect(on.gain).toBeCloseTo(off.gain * 1.2, 6);
    // slower runs never lose points
    const slow = fastLast(30, 4, 6);
    expect(sim(slow, { ...SPEED, speedPointsMax: 0.3 }, LAST)).toEqual(sim(slow, SPEED, LAST));
  });

  it("is causal: future activities never change a day", () => {
    const acts = fastLast(30, 8.8, 6);
    const future = [...acts, run("2026-03-01", 60, 20), run("2026-03-02", 60, 20)];
    const cut = sim(acts, { ...SPEED, speedPointsMax: 0.3 }, "2026-02-28");
    expect(sim(future, { ...SPEED, speedPointsMax: 0.3 }, "2026-02-28")).toEqual(cut);
  });

  it("frequent short runs: 5 km a day about doubles the equilibrium, and a daily run never switches the decay off for good", () => {
    const daily = (km: number) => Array.from({ length: 365 }, (_, i) => run(addDays(START, i), km, 8 + (i % 7)));
    const end = (km: number, patch: ItmConfigPatch) =>
      simulateItm(daily(km), "2026-12-31", { config: mergeItmConfig(DEFAULT_ITM_CONFIG, patch) }).at(-1)!.itm;
    // Levels mode (and the plain 2 % leak): 5 / 0.02 = 250.
    expect(end(5, {})).toBeLessThan(260);
    // Linear: 5 km effort = half a day, so the next day only leaks half: ≈ 500.
    expect(end(5, LINEAR)).toBeGreaterThan(450);
    expect(end(5, LINEAR)).toBeLessThan(520);
    // 10 km effort = one full day of grace, every day. Without the budget the ITM would only ever go up; with it,
    // 21 free days in 28 leave a decay on 1 day in 4: it settles near 10 / (0.02 / 4) = 2,000.
    expect(end(10, { ...LINEAR, graceWindowDays: 0 })).toBeGreaterThan(3000);
    expect(end(10, LINEAR)).toBeLessThan(2100);
    expect(end(15, { ...LINEAR, graceKmPerDay: 10 })).toBeLessThan(3100);
  });
});

describe("grace budget (graceWindowDays)", () => {
  const free = (acts: ItmActivity[], patch: ItmConfigPatch, days: number) =>
    factors(sim(acts, patch, addDays("2026-01-10", days + 1)), "2026-01-10", days);

  it("a single run keeps its days: 21 free days fit in the budget", () => {
    const f = free([run("2026-01-10", 400)], LINEAR, 24);
    expect(f.slice(0, 21).every((x) => x === 0)).toBe(true);
    expect(f.slice(21)).toEqual([1, 1, 1]);
  });

  it("a run every day gets at most graceMaxDays free days in any 28-day window", () => {
    const acts = Array.from({ length: 80 }, (_, i) => run(addDays("2026-01-10", i), 15));
    const f = free(acts, { ...LINEAR, graceKmPerDay: 15 }, 79);
    for (let i = 0; i + 28 <= f.length; i++) {
      const freeDays = f.slice(i, i + 28).reduce((n, x) => n + (1 - x), 0);
      expect(freeDays).toBeLessThanOrEqual(21 + 0.51);
    }
    // …and the decay does come back: not every day is free.
    expect(f.slice(21).some((x) => x > 0)).toBe(true);
  });

  it("0 switches the budget off, and it never touches the levels mode", () => {
    const acts = Array.from({ length: 80 }, (_, i) => run(addDays("2026-01-10", i), 15));
    const off = free(acts, { ...LINEAR, graceKmPerDay: 15, graceWindowDays: 0 }, 79);
    expect(off.every((x) => x === 0)).toBe(true);
    const plain = sim(acts, { graceWindowDays: 0 }, "2026-04-10");
    expect(sim(acts, { graceWindowDays: 7, graceMaxDays: 1 }, "2026-04-10")).toEqual(plain);
  });

  it("does not move a normal history: the owner's 15 km/day series is the same with and without the budget", () => {
    const acts = REAL_HISTORY;
    const a = simulateItm(acts, "2026-10-21", { config: cfg({ ...LINEAR, graceKmPerDay: 15 }) });
    const b = simulateItm(acts, "2026-10-21", { config: cfg({ ...LINEAR, graceKmPerDay: 15, graceWindowDays: 0 }) });
    expect(a).toEqual(b);
  });

  it("validates the window", () => {
    expect(validateItmConfig(cfg({ graceWindowDays: 0 }))).toEqual([]);
    expect(validateItmConfig(cfg({ graceWindowDays: 400 })).join()).toContain("graceWindowDays");
  });
});
