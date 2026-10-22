import { afterAll, describe, expect, it } from "vitest";
import * as pkg from "../src/index";
import { DEFAULT_ITM_CONFIG, ITM_KEYS, mergeItmConfig, validateItmConfig, type ItmConfig } from "../src/index";
import { generateHistory, generateTimed, rng } from "./generator";
import { REAL_HISTORY } from "./history.fixture";
// The frozen original engine (ultra_trail_run, see test/reference/README.md).
import * as ref from "./reference/itm";
import { DEFAULT_ITM_CONFIG as REF_DEFAULT } from "./reference/itmConfig";
import * as refNight from "./reference/nightOut";
import * as refReadiness from "./reference/readiness";
import { stravaAltitude as refStravaAltitude } from "./reference/stravaImport";
import { ZONES as refZones } from "./reference/zones";

/**
 * Golden parity: the package and the original isardtrail.com engine, on the same inputs, must give identical
 * outputs. "Identical" here is strict equality of every field (stronger than the 2-decimal requirement), with the
 * Catalan locale so that labels can be compared too. No modifiers are used.
 */

// Many seeds for the defaults and the live site config; fewer for the random configs (they only widen coverage).
const seeds = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i);
const TIMEOUT = 300_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Configs: the defaults, the live site's (altitudeFrom stored as 1000), and random valid patches.
function randomConfig(seed: number): ItmConfig {
  const r = rng(seed);
  const scale = 0.6 + r.next() * 0.8;
  const c = mergeItmConfig(DEFAULT_ITM_CONFIG, {
    decay: 0.01 + r.next() * 0.04,
    supportFactor: r.next(),
    supportFull: 0.5 + r.next() * 5,
    supportHalfLife: r.int(1, 30),
    supportWindow: r.int(5, 120),
    cushion: 0.5 + r.next() * 0.5,
    shortMinKm: r.int(0, 15),
    homeAltitude: r.chance(0.3) ? r.int(1000, 2500) : 12,
    altitudeFrom: r.int(500, 2500),
    altitudeTrainingPer1000: r.next() * 0.4,
    altitudeTrainingMax: r.next() * 0.6,
    altitudeStayPer1000: r.next() * 0.6,
    altitudeStayMax: r.next() * 0.9,
    altitudeAfterDays: r.int(0, 30),
    levels: Object.fromEntries(
      ITM_KEYS.map((k) => [
        k,
        {
          threshold: Math.round(DEFAULT_ITM_CONFIG.levels[k].threshold * scale),
          grace: r.int(0, 25),
        },
      ]),
    ),
    readiness: { "100k": { nights: r.chance(0.5) ? null : 2 }, "50k": { longest: r.int(10, 40) } },
  });
  expect(validateItmConfig(c)).toEqual([]);
  return c;
}

const CONFIGS: [string, ItmConfig, number][] = [
  ["defaults", DEFAULT_ITM_CONFIG as ItmConfig, 200],
  ["live site (altitudeFrom 1000)", mergeItmConfig(DEFAULT_ITM_CONFIG, { altitudeFrom: 1000 }), 100],
  ...[1, 2, 3, 4, 5].map((s) => [`random config #${s}`, randomConfig(s), 25] as [string, ItmConfig, number]),
];

afterAll(() => ref.setItmConfig(REF_DEFAULT));

it("the reference defaults are the package defaults", () => {
  expect(DEFAULT_ITM_CONFIG).toEqual(REF_DEFAULT);
});

for (const [name, config, n] of CONFIGS) {
  const SEEDS = seeds(n);
  describe(`parity · ${name}`, () => {
    const itm = pkg.createItm({ config, locale: "ca" });
    const useRef = () => ref.setItmConfig(config);

    it(
      "real history (fixture): series, events, readiness every day",
      () => {
        useRef();
        const baseline = { date: "2025-05-01", itm: 0 };
        const until = "2026-10-21";
        const mine = pkg.simulateItm(REAL_HISTORY, until, { baseline, config });
        const theirs = ref.simulateItm(REAL_HISTORY, until, baseline);
        expect(mine).toEqual(theirs);
        expect(itm.simulateItm(REAL_HISTORY, until, { baseline })).toEqual(theirs);
        expect(itm.itmEvents(mine, REAL_HISTORY)).toEqual(ref.itmEvents(theirs, REAL_HISTORY));
        expect(itm.itmDeltas(mine)).toEqual(ref.itmDeltas(theirs));
        const input: pkg.ReadinessInput = {
          sessions: REAL_HISTORY.filter((a) => a.type === "run" || a.type === "trail_run").map((a) => ({
            date: a.date,
            effort: pkg.kmEffort(a.distance_m, a.elevation_gain_m),
            night: false,
            sleptOut: false,
          })),
          supportWeeks: [],
          races: [],
        };
        for (const day of mine) {
          const v = pkg.itmOn(mine, day.date);
          expect(v).toBe(ref.itmOn(theirs, day.date));
          for (const key of ITM_KEYS)
            expect(itm.readinessFor(key, day.date, v, input)).toEqual(
              refReadiness.readinessFor(key, day.date, v, input),
            );
          expect(itm.readyFor(day.date, v, input)).toEqual(refReadiness.readyFor(day.date, v, input));
        }
      },
      TIMEOUT,
    );

    it(
      `${SEEDS.length} seeded random histories: series, events, readiness`,
      () => {
        useRef();
        for (const seed of SEEDS) {
          const h = generateHistory(seed);
          const mine = itm.simulateItm(h.activities, h.until, { baseline: h.baseline, stays: h.stays });
          const theirs = ref.simulateItm(h.activities, h.until, h.baseline, h.stays);
          expect(mine, `seed ${seed}`).toEqual(theirs);
          // The stated contract, explicitly: itm and decay to 2 decimals, level, gain.
          mine.forEach((d, i) => {
            const t = theirs[i]!;
            expect([d.date, r2(d.itm), r2(d.decay), d.level, d.gain]).toEqual([
              t.date,
              r2(t.itm),
              r2(t.decay),
              t.level,
              t.gain,
            ]);
          });
          expect(itm.itmEvents(mine, h.activities), `seed ${seed}`).toEqual(ref.itmEvents(theirs, h.activities));
          expect(itm.itmDeltas(mine)).toEqual(ref.itmDeltas(theirs));
          for (const date of h.sampleDates) {
            const v = itm.itmOn(mine, date);
            expect(v).toBe(ref.itmOn(theirs, date));
            expect(itm.readinessMetrics(h.readiness, date)).toEqual(refReadiness.readinessMetrics(h.readiness, date));
            for (const key of ITM_KEYS)
              expect(itm.readinessFor(key, date, v, h.readiness), `seed ${seed} ${key} ${date}`).toEqual(
                refReadiness.readinessFor(key, date, v, h.readiness),
              );
            expect(itm.readyFor(date, v, h.readiness)).toEqual(refReadiness.readyFor(date, v, h.readiness));
            expect(itm.altitudeStayCut(date, h.stays)).toBe(ref.altitudeStayCut(date, h.stays));
          }
          for (const a of h.activities) {
            expect(itm.qualifyingEffort(a)).toBe(ref.qualifyingEffort(a));
            expect(itm.shortRunEffort(a)).toBe(ref.shortRunEffort(a));
            expect(itm.countedEffort(a)).toBe(ref.countedEffort(a));
            expect(itm.altitudeTrainingBonus(a.altitude_m)).toBe(ref.altitudeTrainingBonus(a.altitude_m));
          }
        }
      },
      TIMEOUT,
    );

    it("helpers: categories, next level, race key, levels, zones", () => {
      useRef();
      for (let e = 0; e <= 400; e += 0.5) {
        expect(itm.sessionCategory(e)).toEqual(ref.sessionCategory(e));
        expect(itm.raceKey(e)).toBe(refReadiness.raceKey(e));
      }
      for (let v = 0; v <= 1600; v += 3.7) expect(itm.nextItmLevel(v)).toEqual(ref.nextItmLevel(v));
      expect(itm.levels).toEqual(ref.ITM_LEVELS);
      expect(itm.zones.map((z) => [z.from, z.level, z.name, z.tagline])).toEqual(
        refZones.map((z) => [z.from, z.level, z.name, z.tagline]),
      );
    });
  });
}

describe("parity · data adapters", () => {
  it("stravaAltitude", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const a = {
        elev_low: r.chance(0.1) ? null : r.int(-900, 9500),
        elev_high: r.chance(0.1) ? undefined : r.int(-900, 9900),
      };
      expect(pkg.stravaAltitude(a)).toBe(refStravaAltitude(a));
    }
  });

  it("isNightRun and sleptOutIds", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const acts = generateTimed(seed);
      expect(pkg.sleptOutIds(acts)).toEqual(refNight.sleptOutIds(acts));
      for (const a of acts)
        expect(pkg.isNightRun(a.start_date_local, a.elapsed_time)).toBe(
          refNight.isNightRun(a.start_date_local, a.elapsed_time),
        );
    }
  });
});

describe("English locale changes labels only", () => {
  it("same events and requirements, other labels", () => {
    const h = generateHistory(42);
    const en = pkg.createItm();
    const ca = pkg.createItm({ locale: "ca" });
    const series = en.simulateItm(h.activities, h.until, { baseline: h.baseline, stays: h.stays });
    const strip = <T extends { label: string }>(xs: T[]) => xs.map(({ label: _label, ...rest }) => rest);
    expect(strip(en.itmEvents(series, h.activities))).toEqual(strip(ca.itmEvents(series, h.activities)));
    const date = h.sampleDates[0]!;
    const v = en.itmOn(series, date);
    const reqs = (x: pkg.Itm) => x.readinessFor("utmb", date, v, h.readiness).requirements.map((q) => [q.key, q.ok]);
    expect(reqs(en)).toEqual(reqs(ca));
  });
});
