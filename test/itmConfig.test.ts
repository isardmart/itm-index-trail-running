import { describe, expect, it } from "vitest";
import {
  DEFAULT_ITM_CONFIG,
  altitudeStayCut as stayCutWith,
  altitudeTrainingBonus as bonusWith,
  createItm,
  diffFromDefault,
  levels,
  mergeItmConfig,
  simulateItm as simulate,
  stravaAltitude,
  validateItmConfig,
  zoneForItm,
  zones,
  type AltitudeStay,
  type ItmActivity,
} from "../src/index";

// Adapted from ultra_trail_run: there are no live bindings any more. Every function takes the config explicitly
// (here the defaults), and "changing the config" means building a new `createItm` instance.
const config = DEFAULT_ITM_CONFIG;
const baseline = { date: "2025-05-01", itm: 0 };
const simulateItm = (acts: ItmActivity[], until: string, _?: undefined, stays: AltitudeStay[] = []) =>
  simulate(acts, until, { baseline, config, stays });
const altitudeTrainingBonus = (alt: number) => bonusWith(alt, config);
const altitudeStayCut = (date: string, stays: AltitudeStay[]) => stayCutWith(date, stays, config);

describe("configuració de l'ITM", () => {
  it("els valors per defecte són els calibrats i vàlids", () => {
    expect(validateItmConfig(DEFAULT_ITM_CONFIG)).toEqual([]);
    expect(levels(config).map((l) => l.threshold)).toEqual([110, 250, 500, 850, 1200]);
    expect(config.decay).toBe(0.02);
  });

  it("un ajust només canvia el que porta, i un requisit a null es treu", () => {
    const c = mergeItmConfig(DEFAULT_ITM_CONFIG, {
      decay: 0.03,
      levels: { "50k": { threshold: 300 } },
      readiness: { "100k": { nights: null, longest: 55 } },
    });
    expect(c.decay).toBe(0.03);
    expect(c.levels["50k"]).toEqual({ threshold: 300, minEffort: 45, grace: 5 });
    expect(c.readiness["100k"].nights).toBeUndefined();
    expect(c.readiness["100k"].longest).toBe(55);
    expect(c.readiness["100k"].support).toBe(1);
    expect(DEFAULT_ITM_CONFIG.levels["50k"].threshold).toBe(250);
  });

  it("es desa només la diferència amb els valors per defecte", () => {
    const c = mergeItmConfig(DEFAULT_ITM_CONFIG, { cushion: 0.7, readiness: { "100k": { nights: null } } });
    expect(diffFromDefault(c)).toEqual({ cushion: 0.7, readiness: { "100k": { nights: null } } });
    expect(diffFromDefault(DEFAULT_ITM_CONFIG)).toEqual({});
    expect(mergeItmConfig(DEFAULT_ITM_CONFIG, diffFromDefault(c))).toEqual(c);
  });

  it("rebutja llindars que no pugen i valors fora de rang", () => {
    const c = mergeItmConfig(DEFAULT_ITM_CONFIG, { decay: 0.5, levels: { "100k": { threshold: 200 } } });
    const errors = validateItmConfig(c);
    expect(errors.some((e) => e.startsWith("decay"))).toBe(true);
    expect(errors.some((e) => e.includes("100k"))).toBe(true);
  });

  it("canviar-la mou nivells, franges, colors i requisits, i el càlcul de l'ITM", () => {
    const acts = [{ date: "2026-01-01", type: "trail_run" as const, distance_m: 30_000, elevation_gain_m: 1000 }];
    const before = simulateItm(acts, "2026-01-20").at(-1)!.itm;
    // Adapted: instead of setItmConfig(...), a new instance bound to the new config.
    const itm = createItm({
      config: mergeItmConfig(DEFAULT_ITM_CONFIG, {
        decay: 0.04,
        levels: { utmb: { threshold: 1500 }, "20k": { threshold: 100 } },
        readiness: { "20k": { longest: 18 } },
      }),
    });
    expect(itm.config.decay).toBe(0.04);
    expect(itm.levels.at(-1)!.threshold).toBe(1500);
    expect(itm.levels.find((l) => l.key === "20k")!.weekly).toBe(Math.round(100 * 7 * 0.04));
    expect(itm.zones.find((z) => z.key === "summit")!.from).toBe(1500);
    expect(itm.zoneForItm(105).key).toBe("forest");
    expect(itm.config.readiness["20k"].longest).toBe(18);
    expect(itm.simulateItm(acts, "2026-01-20", { baseline }).at(-1)!.itm).toBeLessThan(before);
    // …and nothing else changed (no shared state).
    expect(zoneForItm(105, zones(config)).key).toBe("valley");
    expect(simulateItm(acts, "2026-01-20").at(-1)!.itm).toBe(before);
  });
});

describe("altitud", () => {
  const run = (altitude_m: number | null) => [
    { date: "2026-01-01", type: "trail_run" as const, distance_m: 25_000, elevation_gain_m: 1000, altitude_m },
  ];

  it("una sortida per sobre de 1.500 m suma més, amb un màxim", () => {
    expect(altitudeTrainingBonus(12)).toBe(0);
    expect(altitudeTrainingBonus(1500)).toBe(0);
    expect(altitudeTrainingBonus(2500)).toBeCloseTo(0.15);
    expect(altitudeTrainingBonus(6000)).toBe(0.3);
    const low = simulateItm(run(12), "2026-01-01").at(-1)!.itm;
    const high = simulateItm(run(2500), "2026-01-01").at(-1)!.itm;
    expect(high).toBeCloseTo(low * 1.15, 1);
  });

  it("dormir en altitud frena la baixada mentre s'hi és i unes setmanes després, i a casa no", () => {
    const stays = [{ start: "2026-01-05", end: "2026-01-11", altitude_m: 2500 }];
    expect(altitudeStayCut("2026-01-04", stays)).toBe(0);
    expect(altitudeStayCut("2026-01-08", stays)).toBeCloseTo(0.3);
    const after = altitudeStayCut("2026-01-18", stays);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(0.3);
    expect(altitudeStayCut("2026-02-01", stays)).toBe(0);
    const home = simulateItm(run(12), "2026-01-20").at(-1)!.itm;
    const away = simulateItm(run(12), "2026-01-20", undefined, stays).at(-1)!.itm;
    expect(away).toBeGreaterThan(home);
  });

  it("l'altitud de la sortida és el punt mig d'Strava", () => {
    expect(stravaAltitude({ elev_low: 1200, elev_high: 2200 })).toBe(1700);
    expect(stravaAltitude({})).toBeNull();
  });
});

describe("suport (força, mobilitat, natació)", () => {
  const run = { date: "2026-01-01", type: "trail_run" as const, distance_m: 30_000, elevation_gain_m: 1000 };
  const strength = (date: string) => ({ date, type: "strength" as const, distance_m: null, elevation_gain_m: null });

  it("el fre s'esvaeix a poc a poc: cap salt brusc quan fa una setmana de l'última sessió", () => {
    const s = simulateItm([run, strength("2026-01-04")], "2026-01-30");
    const decays = s.filter((d) => d.date >= "2026-01-05").map((d) => d.decay / (d.itm + d.decay));
    for (let i = 1; i < decays.length; i++) expect(decays[i]! - decays[i - 1]!).toBeLessThan(0.002);
  });

  it("amb força la baixada és més lenta que sense", () => {
    const with_ = simulateItm([run, strength("2026-01-04"), strength("2026-01-08")], "2026-01-20").at(-1)!.itm;
    const without = simulateItm([run], "2026-01-20").at(-1)!.itm;
    expect(with_).toBeGreaterThan(without);
  });
});
