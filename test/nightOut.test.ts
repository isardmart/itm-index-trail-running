import { describe, expect, it } from "vitest";
import { isNightRun, sleptOutIds, type TimedActivity } from "../src/index";

const act = (o: Partial<TimedActivity> & { id: number }): TimedActivity => ({
  name: "Sortida",
  start_date_local: "2026-08-01T09:00:00Z",
  elapsed_time: 3600,
  ...o,
});

describe("isNightRun", () => {
  it("de nit si comença o acaba entre les 22 i les 5", () => {
    expect(isNightRun("2026-08-01T21:30:00Z", 3600)).toBe(true); // acaba a les 22:30
    expect(isNightRun("2026-08-01T04:30:00Z", 3600)).toBe(true);
    expect(isNightRun("2026-08-01T22:15:00Z", 600)).toBe(true);
    expect(isNightRun("2026-08-01T07:00:00Z", 7200)).toBe(false);
    expect(isNightRun("2026-08-01T18:00:00Z", 3 * 3600)).toBe(false); // acaba a les 21
  });
});

describe("sleptOutIds", () => {
  it("paraules de dormir i moltes hores", () => {
    const ids = sleptOutIds([
      act({ id: 1, name: "Travessa amb bivac al Cadí", elapsed_time: 26 * 3600 }),
      act({ id: 2, name: "Dormint al refugi", elapsed_time: 3 * 3600 }), // massa curta i de dia
      act({
        id: 3,
        name: "Volta",
        description: "Vam dormir a la tenda",
        start_date_local: "2026-08-01T20:00:00Z",
        elapsed_time: 12 * 3600,
      }),
      act({ id: 4, name: "Rodatge llarg", elapsed_time: 12 * 3600 }), // sense paraules
    ]);
    expect([...ids].sort()).toEqual([1, 3]);
  });
  it("accents i majúscules no importen", () => {
    expect(sleptOutIds([act({ id: 9, name: "NIT AL REFUGI", elapsed_time: 11 * 3600 })]).has(9)).toBe(true);
    expect(sleptOutIds([act({ id: 8, name: "Acampàda a la Cerdanya", elapsed_time: 11 * 3600 })]).has(8)).toBe(true);
  });
  it("ruta de dos dies: s'acaba al vespre i l'endemà es surt del mateix lloc", () => {
    const ids = sleptOutIds([
      act({
        id: 1,
        start_date_local: "2026-08-01T10:00:00Z",
        elapsed_time: 8 * 3600,
        start_latlng: [42.2, 1.7],
        end_latlng: [42.3, 1.6],
      }),
      act({ id: 2, start_date_local: "2026-08-02T07:30:00Z", elapsed_time: 6 * 3600, start_latlng: [42.301, 1.601] }),
      act({
        id: 3,
        start_date_local: "2026-08-05T10:00:00Z",
        elapsed_time: 8 * 3600,
        start_latlng: [42.2, 1.7],
        end_latlng: [42.3, 1.6],
      }),
      act({ id: 4, start_date_local: "2026-08-06T07:30:00Z", elapsed_time: 6 * 3600, start_latlng: [41.4, 2.1] }), // lluny
    ]);
    expect([...ids]).toEqual([1]);
  });

  it("una volta des de casa al vespre i una altra l'endemà al matí no és cap nit fora", () => {
    const home: [number, number] = [41.85, 1.29];
    const ids = sleptOutIds([
      act({
        id: 1,
        start_date_local: "2025-08-22T18:45:00Z",
        elapsed_time: 9976,
        start_latlng: home,
        end_latlng: home,
      }),
      act({
        id: 2,
        start_date_local: "2025-08-23T08:39:00Z",
        elapsed_time: 5400,
        start_latlng: home,
        end_latlng: home,
      }),
    ]);
    expect(ids.size).toBe(0);
  });
});
