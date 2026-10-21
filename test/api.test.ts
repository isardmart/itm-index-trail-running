import { describe, expect, it } from "vitest";
import * as pkg from "../src/index";
import {
  DEFAULT_ITM_CONFIG,
  IMPORTED_STRAVA_CATEGORIES,
  ItmConfigError,
  LEVEL_LOOK,
  LOCALES,
  addDays,
  countedEffort,
  createItm,
  daysBetween,
  en,
  fromStravaActivity,
  isDateOnly,
  levels,
  mergeItmConfig,
  readinessFor,
  readyFor,
  simulateItm,
  stravaCategory,
  validateItmConfig,
  weekStart,
  type ItmLocale,
} from "../src/index";
import { REAL_HISTORY } from "./history.fixture";

describe("public API surface", () => {
  it("exports the names the website uses", () => {
    for (const name of [
      "kmEffort",
      "DEFAULT_ITM_CONFIG",
      "mergeItmConfig",
      "validateItmConfig",
      "diffFromDefault",
      "simulateItm",
      "itmOn",
      "itmDeltas",
      "itmEvents",
      "nextItmLevel",
      "sessionCategory",
      "qualifyingEffort",
      "shortRunEffort",
      "countedEffort",
      "altitudeTrainingBonus",
      "altitudeStayCut",
      "readinessMetrics",
      "readinessFor",
      "readyFor",
      "raceKey",
      "isNightRun",
      "sleptOutIds",
      "stravaAltitude",
      "fromStravaActivity",
      "zones",
      "levels",
      "createItm",
    ])
      expect(pkg, name).toHaveProperty(name);
  });

  it("the default config is deeply frozen (no global mutable state)", () => {
    expect(Object.isFrozen(DEFAULT_ITM_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ITM_CONFIG.levels["50k"])).toBe(true);
    expect(Object.isFrozen(DEFAULT_ITM_CONFIG.readiness.utmb.previousRace)).toBe(true);
    expect(() => {
      (DEFAULT_ITM_CONFIG as { decay: number }).decay = 1;
    }).toThrow();
  });
});

describe("createItm", () => {
  it("binds config, patch and locale; instances are independent and frozen", () => {
    const site = createItm({ patch: { altitudeFrom: 1000 }, locale: "ca" });
    const plain = createItm();
    expect(site.config.altitudeFrom).toBe(1000);
    expect(plain.config.altitudeFrom).toBe(1500);
    expect(site.altitudeTrainingBonus(2000)).toBeCloseTo(0.15);
    expect(plain.altitudeTrainingBonus(2000)).toBeCloseTo(0.075);
    expect(Object.isFrozen(site)).toBe(true);
    expect(site.locale.code).toBe("ca");
    expect(site.kmEffort(20_000, 1000)).toBe(30);
  });

  it("a patch applies on top of a full config", () => {
    const base = mergeItmConfig(DEFAULT_ITM_CONFIG, { readiness: { "100k": { nights: null } } });
    const itm = createItm({ config: base, patch: { cushion: 0.7 } });
    expect(itm.config.cushion).toBe(0.7);
    expect(itm.config.readiness["100k"].nights).toBeUndefined();
  });

  it("rejects an invalid config", () => {
    expect(() => createItm({ patch: { decay: 3 } })).toThrow(ItmConfigError);
    expect(() => simulateItm([], "2026-01-01", { config: { ...DEFAULT_ITM_CONFIG, cushion: 0 } })).toThrow(
      /cushion must be between/,
    );
    try {
      createItm({ patch: { decay: 3 } });
    } catch (e) {
      expect((e as ItmConfigError).errors).toEqual(["decay must be between 0.001 and 0.2."]);
    }
  });

  it("bound helpers match the standalone ones", () => {
    const itm = createItm();
    const a = { type: "run" as const, distance_m: 10_000, elevation_gain_m: 300 };
    expect(itm.countedEffort(a)).toBe(countedEffort(a));
    expect(itm.shortRunEffort(a)).toBe(13);
    expect(itm.sessionCategory(50)!.key).toBe("50k");
    expect(itm.raceKey(80)).toBe("100k");
    expect(itm.zoneForItm(900).key).toBe("ridges");
    expect(itm.nextZone(itm.zones[4]!)!.key).toBe("summit");
    const stays = [{ start: "2026-01-01", end: "2026-01-03", altitude_m: 2500 }];
    expect(itm.altitudeStayCut("2026-01-02", stays)).toBeCloseTo(0.3);
    const series = itm.simulateItm(REAL_HISTORY, "2026-09-06", { baseline: { date: "2025-05-01", itm: 0 } });
    expect(itm.itmOn(series, "2026-09-06")).toBe(series.at(-1)!.itm);
    expect(itm.itmEvents(series, REAL_HISTORY).length).toBeGreaterThan(50);
    expect(itm.nextItmLevel(0)!.level.key).toBe("20k");
    expect(itm.nextItmLevel(5000)).toBeNull();
  });

  it("the athlete's home altitude replaces config.homeAltitude", () => {
    const highHome = createItm({ athlete: { homeAltitude: 2500 } });
    expect(highHome.altitudeStayCut("2026-01-01", [])).toBeCloseTo(0.3);
    const s = highHome.simulateItm([], "2026-01-02", { baseline: { date: "2026-01-01", itm: 100 } });
    expect(s[1]!.decay).toBeCloseTo(100 * 0.02 * 0.7, 2);
  });
});

describe("simulateItm defaults", () => {
  it("without a baseline, starts at the first activity with ITM 0", () => {
    const s = simulateItm([{ date: "2026-03-03", type: "run", distance_m: 25_000, elevation_gain_m: 0 }], "2026-03-05");
    expect(s.map((d) => d.date)).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
    expect(s[0]!.itm).toBe(25);
  });
  it("without activities nor baseline, a single day at 0", () => {
    expect(simulateItm([], "2026-03-05")).toEqual([{ date: "2026-03-05", itm: 0, level: 0, gain: 0, decay: 0 }]);
  });
  it("until before the start gives an empty series", () => {
    expect(simulateItm([], "2026-01-01", { baseline: { date: "2026-02-01", itm: 10 } })).toEqual([]);
  });
});

describe("readiness standalone", () => {
  it("works with explicit options and locale", () => {
    const input = { sessions: [], supportWeeks: [], races: [] };
    const r = readinessFor("utmb", "2026-01-01", 2000, input, { locale: "ca" });
    expect(r.requirements.map((q) => q.label)).toContain("Nit fora (12 mesos)");
    expect(r.requirements.at(-1)).toMatchObject({
      key: "previousRace",
      have: "No",
      label: expect.stringContaining(" o "),
    });
    expect(readinessFor("utmb", "2026-01-01", 2000, input).requirements.at(-1)!.label).toBe(
      "Finished race: 100K or 100M or UTMB (24 months)",
    );
    expect(readyFor("2026-01-01", 2000, input)).toBeNull();
  });
  it("formats the support average with the locale", () => {
    const input = { sessions: [], supportWeeks: [{ week: "2025-12-29", count: 12 }], races: [] };
    expect(
      readinessFor("100m", "2026-01-01", 0, input, { locale: "ca" }).requirements.find((q) => q.key === "support"),
    ).toMatchObject({ have: "1,5", need: "1,5", ok: true });
    expect(readinessFor("100m", "2026-01-01", 0, input).requirements.find((q) => q.key === "support")).toMatchObject({
      have: "1.5",
      need: "1.5",
    });
  });
});

describe("locales", () => {
  it("built-ins and custom locales", () => {
    expect(Object.keys(LOCALES)).toEqual(["en", "ca"]);
    const shout: ItmLocale = { ...en, code: "en", noLevel: "NONE", events: { ...en.events, weeklyDecay: "DECAY" } };
    const acts = [{ date: "2026-01-01", type: "trail_run" as const, distance_m: 30_000, elevation_gain_m: 0 }];
    const itm = createItm({ locale: shout });
    const s = itm.simulateItm(acts, "2026-01-30", { baseline: { date: "2025-12-30", itm: 230 } });
    expect(itm.itmEvents(s, acts).map((e) => e.label)).toEqual(
      expect.arrayContaining(["Category run 20K", "Level 50K", "DECAY", "Down to 20K"]),
    );
    expect(() => createItm({ locale: "xx" as "en" })).toThrow(/Unknown ITM locale/);
  });
  it("altitude labels", () => {
    const acts = [
      { date: "2026-01-01", type: "trail_run" as const, distance_m: 30_000, elevation_gain_m: 0, altitude_m: 2500 },
      { date: "2026-01-02", type: "run" as const, distance_m: 10_000, elevation_gain_m: 0, altitude_m: 2500 },
    ];
    const s = simulateItm(acts, "2026-01-03");
    const labels = pkg.itmEvents(s, acts).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(["Category run 20K at altitude", "Run at altitude"]));
    expect(pkg.itmEvents(s, acts, { locale: "ca" }).map((e) => e.label)).toEqual(
      expect.arrayContaining(["Sortida de categoria 20K en altitud", "Sortida de córrer en altitud"]),
    );
  });
});

describe("levels", () => {
  it("labels, colours, thresholds and derived weekly effort", () => {
    expect(levels().map((l) => [l.label, l.color, l.threshold, l.weekly])).toEqual([
      ["20K", "#f6dc2d", 110, 15],
      ["50K", "#f0782a", 250, 35],
      ["100K", "#52c458", 500, 70],
      ["100M", "#e0372f", 850, 119],
      ["UTMB", "#eef3f8", 1200, 168],
    ]);
    expect(Object.isFrozen(LEVEL_LOOK.utmb)).toBe(true);
  });
});

describe("config validation branches", () => {
  it("reports every kind of error", () => {
    const c = mergeItmConfig(DEFAULT_ITM_CONFIG, {
      levels: { "50k": { minEffort: 10 } },
      readiness: {
        "100k": { backToBack: -1, nights: 99, sleptOut: 99, support: 99, previousRace: ["x" as "50k"] },
        "50k": { previousRace: [] },
      },
    });
    const errors = validateItmConfig(c).join("\n");
    expect(errors).toMatch(/minEffort of 50k/);
    expect(errors).toMatch(/readiness.100k.backToBack/);
    expect(errors).toMatch(/readiness.100k.nights/);
    expect(errors).toMatch(/readiness.100k.sleptOut/);
    expect(errors).toMatch(/readiness.100k.support/);
    expect(errors).toMatch(/readiness.100k.previousRace/);
    expect(errors).toMatch(/readiness.50k.previousRace/);
    expect(mergeItmConfig(DEFAULT_ITM_CONFIG, null)).toBe(DEFAULT_ITM_CONFIG);
  });
});

describe("Strava adapter", () => {
  const summary = {
    type: "Run",
    sport_type: "TrailRun",
    start_date_local: "2026-08-23T07:12:00Z",
    distance: 37_897.4,
    total_elevation_gain: 1352.2,
    elev_low: 1200,
    elev_high: 2400,
  };
  it("maps a summary activity to an ITM activity", () => {
    expect(fromStravaActivity(summary)).toEqual({
      date: "2026-08-23",
      type: "trail_run",
      distance_m: 37_897,
      elevation_gain_m: 1352,
      altitude_m: 1800,
    });
  });
  it("skips what the site does not import, unless asked", () => {
    const ride = { ...summary, type: "Ride", sport_type: "MountainBikeRide" };
    expect(fromStravaActivity(ride)).toBeNull();
    expect(fromStravaActivity(ride, { includeAllCategories: true })!.type).toBe("other");
    expect(IMPORTED_STRAVA_CATEGORIES.has("hike")).toBe(false);
  });
  it("categories", () => {
    expect(
      ["Run", "Hike", "Walk", "Ride", "Swim", "WeightTraining", "Yoga", "Kayaking", ""].map((t) => stravaCategory(t)),
    ).toEqual(["run", "hike", "hike", "ride", "swim", "strength", "mobility", "other", "other"]);
    expect(stravaCategory("Run", "TrailRun")).toBe("trail");
  });
  it("clamps absurd values", () => {
    const a = fromStravaActivity({ ...summary, distance: 5e9, total_elevation_gain: -10, elev_low: null });
    expect(a).toMatchObject({ distance_m: 1_000_000, elevation_gain_m: 0, altitude_m: null });
  });
});

describe("dates", () => {
  it("DateOnly helpers", () => {
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-1-1")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-01-01", "2025-12-25")).toBe(-7);
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
});
