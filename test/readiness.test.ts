import { describe, expect, it } from "vitest";
import type { DateOnly } from "../src/index";
import { addDays, createItm, readinessMetrics, type ReadinessInput } from "../src/index";

// Adapted from ultra_trail_run: functions bound to an explicit config (the defaults).
const { raceKey, readinessFor, readyFor } = createItm();

const s = (date: DateOnly, effort: number, extra: Partial<{ night: boolean; sleptOut: boolean }> = {}) => ({
  date,
  effort,
  night: false,
  sleptOut: false,
  ...extra,
});

/** 12 setmanes de 3 sortides (10, 12 i una llarga de 30): ~52 km esforç per setmana. */
function block(until: DateOnly): ReadinessInput["sessions"] {
  const out: ReadinessInput["sessions"] = [];
  for (let w = 0; w < 12; w++) {
    const monday = addDays(until, -7 * (w + 1) + 1);
    out.push(s(monday, 10), s(addDays(monday, 2), 12), s(addDays(monday, 5), 30));
  }
  return out;
}

describe("readinessMetrics", () => {
  it("llarga, doblet, acumulat, nits i mobilitat en les finestres que toquen", () => {
    const input: ReadinessInput = {
      sessions: [s("2026-09-05", 55), s("2026-09-06", 20, { night: true }), s("2026-01-01", 90, { sleptOut: true })],
      supportWeeks: [
        { week: "2026-09-21", count: 2 },
        { week: "2026-09-28", count: 2 },
      ],
      races: [],
    };
    const m = readinessMetrics(input, "2026-10-02");
    expect(m.longest).toBe(55);
    expect(m.backToBack).toBe(75);
    expect(m.accumulated).toBe(75); // la de gener ja és fora de les 12 setmanes
    expect(m.nights).toBe(1);
    expect(m.sleptOut).toBe(1); // però dins dels 12 mesos
    expect(m.support).toBe(0.5);
  });
});

describe("readinessFor", () => {
  const input: ReadinessInput = { sessions: block("2026-10-02"), supportWeeks: [], races: [] };
  it("preparat per a una 50K amb forma i volum; per a una 100K falten requisits", () => {
    expect(readinessFor("50k", "2026-10-02", 300, input).ready).toBe(true);
    const r100 = readinessFor("100k", "2026-10-02", 500, input);
    expect(r100.ready).toBe(false);
    const missing = r100.requirements.filter((r) => !r.ok).map((r) => r.key);
    expect(missing).toEqual(expect.arrayContaining(["longest", "backToBack", "nights", "support", "previousRace"]));
  });
  it("sense forma no n'hi ha prou amb el volum", () => {
    expect(readinessFor("50k", "2026-10-02", 200, input).ready).toBe(false);
  });
  it("la categoria més alta preparada", () => {
    expect(readyFor("2026-10-02", 300, input)?.label).toBe("50K");
    expect(readyFor("2026-10-02", 50, input)).toBeNull();
  });
  it("categoria d'una cursa pels seus km esforç", () => {
    expect(raceKey(68)).toBe("50k");
    expect(raceKey(278)).toBe("utmb");
    expect(raceKey(10)).toBeNull();
  });
});
