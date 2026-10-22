import { describe, expect, it } from "vitest";
import type { DateOnly, ItmBaseline } from "../src/index";
import { DEFAULT_ITM_CONFIG, addDays, daysBetween, itmOn, kmEffort, readinessFor, simulateItm } from "../src/index";
import type { ReadinessInput } from "../src/index";
import { REAL_HISTORY } from "./history.fixture";

// Adapted from ultra_trail_run: explicit config and baseline (the site starts the series on 2025-05-01 at ITM 0).
const config = DEFAULT_ITM_CONFIG;
const baseline: ItmBaseline = { date: "2025-05-01", itm: 0 };

/**
 * Calibració amb l'historial real. La referència: el 5-9-2026 («Estem preparats per la marató», 31,9 km i 2.281 m
 * D+, 55 km esforç) és quan s'està preparat per a una 50K (el ✓ de la llegenda: forma i requisits), unes setmanes
 * abans de l'Ultra Pirineu. No cal que sigui exactament aquell dia: s'accepta una setmana de marge.
 */
describe("historial real", () => {
  const series = simulateItm(REAL_HISTORY, "2026-09-06", { baseline, config });
  const input: ReadinessInput = {
    sessions: REAL_HISTORY.filter((a) => a.type === "run" || a.type === "trail_run").map((a) => ({
      date: a.date,
      effort: kmEffort(a.distance_m, a.elevation_gain_m),
      night: false,
      sleptOut: false,
    })),
    supportWeeks: [],
    races: [],
  };
  const ready50k = (date: DateOnly) => readinessFor("50k", date, itmOn(series, date), input, { config }).ready;
  const REFERENCE: DateOnly = "2026-09-05";

  it("el 5-9-2026 s'està preparat per a una 50K", () => {
    expect(ready50k(REFERENCE)).toBe(true);
  });

  it("la preparació per a la 50K d'aquest any arriba a prop del 5-9-2026 (± 7 dies)", () => {
    let first: DateOnly | null = null;
    for (let d: DateOnly = "2026-01-01"; d <= REFERENCE && !first; d = addDays(d, 1)) if (ready50k(d)) first = d;
    expect(first).not.toBeNull();
    expect(Math.abs(daysBetween(first!, REFERENCE))).toBeLessThanOrEqual(7);
  });

  it("un any abans (5-9-2025) encara no", () => {
    expect(ready50k("2025-09-05")).toBe(false);
  });
});
