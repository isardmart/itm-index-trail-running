import { describe, expect, it } from "vitest";
import {
  DEFAULT_ITM_CONFIG,
  itmDeltas,
  itmEvents as events,
  itmOn,
  levels,
  nextItmLevel as next,
  qualifyingEffort as qualifying,
  sessionCategory as category,
  shortRunEffort as shortRun,
  simulateItm as simulate,
  type ItmActivity,
  type ItmBaseline,
  type ItmDay,
} from "../src/index";

// Adapted from ultra_trail_run: the config and the baseline are explicit arguments (no live bindings), and labels
// come from the Catalan locale, as on the site.
const config = DEFAULT_ITM_CONFIG;
const ITM_LEVELS = levels(config);
const ITM_BASELINE: ItmBaseline = { date: "2025-05-01", itm: 0 };
const simulateItm = (acts: ItmActivity[], until: string, baseline: ItmBaseline = ITM_BASELINE) =>
  simulate(acts, until, { baseline, config });
const itmEvents = (series: ItmDay[], acts: ItmActivity[]) => events(series, acts, { config, locale: "ca" });
const nextItmLevel = (itm: number) => next(itm, config);
const qualifyingEffort = (a: ItmActivity) => qualifying(a, config);
const shortRunEffort = (a: ItmActivity) => shortRun(a, config);
const sessionCategory = (effort: number) => category(effort, config);

const run = (date: string, km: number, gain = 0): ItmActivity => ({
  date,
  type: "trail_run",
  distance_m: km * 1000,
  elevation_gain_m: gain,
});
const other = (date: string, type: ItmActivity["type"]): ItmActivity => ({
  date,
  type,
  distance_m: null,
  elevation_gain_m: null,
});
const base = { date: "2026-01-01", itm: 400 };

describe("sortides que compten", () => {
  it("demana 20 km esforç: 20 km plans o 15 km amb 500 m D+", () => {
    expect(qualifyingEffort(run("2026-01-01", 20))).toBe(20);
    expect(qualifyingEffort(run("2026-01-01", 15, 500))).toBe(20);
    expect(qualifyingEffort(run("2026-01-01", 19, 0))).toBeNull();
  });
  it("només córrer: la natació o la força no compten", () => {
    expect(qualifyingEffort({ ...other("2026-01-01", "swim"), distance_m: 5000 })).toBeNull();
  });
  it("categoria segons el km esforç", () => {
    expect(sessionCategory(22)?.label).toBe("20K");
    expect(sessionCategory(68)?.label).toBe("50K");
    expect(sessionCategory(10)).toBeNull();
    expect(sessionCategory(160)?.label).toBe("100M");
    expect(sessionCategory(278)?.label).toBe("UTMB");
  });
});

describe("simulateItm", () => {
  it("suma els km esforç de cada sortida de categoria, sense límit setmanal", () => {
    const s = simulateItm([run("2026-01-01", 25), run("2026-01-02", 25)], "2026-01-02", base);
    expect(s.at(-1)!.itm).toBeCloseTo(450, 0);
  });
  it("no hi ha deteriorament dins el marge d'una sortida i sí després", () => {
    const s = simulateItm([run("2026-01-01", 25)], "2026-01-12", base);
    const dec = (d: string) => s.find((x) => x.date === d)!.decay;
    expect(dec("2026-01-03")).toBe(0);
    expect(dec("2026-01-04")).toBe(0); // 20K: 3 dies de marge
    expect(dec("2026-01-05")).toBeGreaterThan(0);
  });
  it("els marges són 3, 5, 7 i 14 dies", () => {
    const decays = (km: number, gain: number) => {
      const s = simulateItm([run("2026-01-01", km, gain)], "2026-02-01", { date: "2026-01-01", itm: 0 });
      return s.find((x) => x.decay > 0)!.date;
    };
    // Amb ITM 0 al començar, només el guany fa pujar: el primer dia amb deteriorament és data + marge + 1.
    expect(decays(25, 0)).toBe("2026-01-05");
    expect(decays(30, 1500)).toBe("2026-01-07"); // 45 → 50K
    expect(decays(30, 5000)).toBe("2026-01-09"); // 80 → 100K
    expect(decays(30, 16000)).toBe("2026-01-16"); // 190 → 100M
  });
  it("sense fer res el deteriorament és directe i proporcional", () => {
    const s = simulateItm([], "2026-01-11", base);
    expect(s.at(-1)!.itm).toBeCloseTo(400 * 0.98 ** 10, 1);
  });
  it("la força i la natació frenen el deteriorament però no fan pujar", () => {
    const quiet = simulateItm([run("2026-01-01", 25)], "2026-01-20", base).at(-1)!.itm;
    const kept = simulateItm(
      [run("2026-01-01", 25), other("2026-01-09", "strength"), other("2026-01-15", "swim")],
      "2026-01-20",
      base,
    ).at(-1)!.itm;
    expect(kept).toBeGreaterThan(quiet);
    expect(kept).toBeLessThan(425);
  });
  it("el suport només frena un temps: passades unes setmanes cau igual", () => {
    const acts: ItmActivity[] = [run("2026-01-01", 25)];
    for (let d = 5; d < 120; d += 3)
      acts.push(
        other(
          `2026-${String(1 + Math.floor((d - 1) / 30)).padStart(2, "0")}-${String(((d - 1) % 30) + 1).padStart(2, "0")}`,
          "strength",
        ),
      );
    const last = simulateItm(acts, "2026-04-30", base).at(-1)!.itm;
    expect(last).toBeLessThan(300);
  });
  it("coixí: es puja en arribar al llindar però no es baixa fins a un 20 % per sota", () => {
    const s = simulateItm([run("2026-01-01", 40, 2000)], "2026-04-01", { date: "2026-01-01", itm: 200 });
    expect(s[0]!.level).toBe(2); // 200 + 60 = 260 → 50K (250)
    expect(s.find((x) => x.itm < 250)!.level).toBe(2);
    expect(s.find((x) => x.itm < 200 - 0.01)!.level).toBe(1);
  });
  it("els llindars són els d'una setmana tipus (km esforç ÷ 7 ÷ 2 %)", () => {
    expect(ITM_LEVELS.map((l) => l.threshold)).toEqual([110, 250, 500, 850, 1200]);
  });
  it("el passat no canvia amb el futur", () => {
    const a = simulateItm([run("2026-01-01", 25)], "2026-01-10", base);
    const b = simulateItm([run("2026-01-01", 25), run("2026-02-01", 60)], "2026-02-10", base);
    expect(b.slice(0, a.length)).toEqual(a);
  });
  it("per defecte comença a zero quan va començar el trail running", () => {
    const s = simulateItm([run("2026-10-03", 41.8, 2616)], "2026-10-11");
    expect(s[0]).toMatchObject({ date: ITM_BASELINE.date, itm: 0, level: 0 });
    expect(s.at(-1)!.itm).toBeGreaterThan(60);
  });
});

describe("sortides de 9 km o més", () => {
  it("compten pels seus km esforç, sense categoria", () => {
    expect(shortRunEffort(run("2026-01-01", 10, 300))).toBe(13);
    expect(shortRunEffort(run("2026-01-01", 8, 600))).toBeNull(); // menys de 9 km
    expect(shortRunEffort(run("2026-01-01", 25))).toBeNull(); // ja és de categoria
    expect(shortRunEffort({ ...other("2026-01-01", "swim"), distance_m: 12000 })).toBeNull();
  });
  it("sumen però no tenen marge: l'endemà ja hi ha deteriorament", () => {
    const s = simulateItm([run("2026-01-01", 10, 300)], "2026-01-03", base);
    const day = (d: string) => s.find((x) => x.date === d)!;
    expect(day("2026-01-01").gain).toBe(13);
    expect(day("2026-01-02").decay).toBeGreaterThan(0);
  });
  it("surten als esdeveniments", () => {
    const acts = [run("2026-01-01", 10, 300)];
    const ev = itmEvents(simulateItm(acts, "2026-01-02", base), acts);
    expect(ev.some((e) => e.kind === "session" && e.delta === 13)).toBe(true);
  });
});

describe("helpers", () => {
  const acts = [run("2026-01-01", 25), run("2026-01-10", 30, 500)];
  const series = simulateItm(acts, "2026-01-20", base);
  it("els increments diaris sumen l'ITM", () => {
    const sum = itmDeltas(series).reduce((a, d) => a + d.points, 0);
    expect(sum).toBeCloseTo(series.at(-1)!.itm, 1);
    expect(itmOn(series, "2026-01-05")).toBeGreaterThan(0);
  });
  it("els esdeveniments expliquen sortides, deteriorament i nivells", () => {
    const ev = itmEvents(series, acts);
    expect(ev.filter((e) => e.kind === "session").map((e) => e.delta)).toEqual([25, 35]);
    expect(ev.some((e) => e.kind === "decay" && e.delta < 0)).toBe(true);
  });
  it("següent nivell i el que hi falta", () => {
    expect(nextItmLevel(200)?.level.label).toBe("50K");
    expect(nextItmLevel(200)?.missing).toBe(50);
    expect(nextItmLevel(1700)).toBeNull();
  });
});
