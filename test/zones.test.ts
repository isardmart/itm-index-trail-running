import { describe, expect, it } from "vitest";
import { DEFAULT_ITM_CONFIG, kmEffort, levels, nextZone, raceKey, zoneForItm, zoneForLevel, zones } from "../src/index";

// Adapted from ultra_trail_run: zones are built from an explicit config. The site-specific milestone helpers
// (zoneOfEach, groupByZone, SEED_MILESTONES) stay on the website; here only the band boundaries are tested.
const config = DEFAULT_ITM_CONFIG;
const ZONES = zones(config);
const ITM_LEVELS = levels(config);

describe("franges de la muntanya", () => {
  it("cada nivell de l'ITM obre una franja, de la vall al cim", () => {
    expect(ZONES.slice(1).map((z) => z.from)).toEqual(ITM_LEVELS.map((l) => l.threshold));
    expect(zoneForItm(0, ZONES).key).toBe("valley");
    expect(zoneForItm(109, ZONES).key).toBe("valley");
    expect(zoneForItm(110, ZONES).key).toBe("forest");
    expect(zoneForItm(326, ZONES).key).toBe("pines");
    expect(zoneForItm(5000, ZONES).key).toBe("summit");
    expect(nextZone(ZONES.at(-1)!, ZONES)).toBeNull();
    expect(nextZone(ZONES[0]!, ZONES)!.key).toBe("forest");
  });

  it("nivells de les curses del camí (km esforç = km + D+/100)", () => {
    const at = (km: number, gain: number | null) => zoneForLevel(raceKey(kmEffort(km * 1000, gain ?? 0)), ZONES).key;
    expect(at(21, 700)).toBe("forest"); // Bell Race
    expect(at(21.1, null)).toBe("forest"); // Mitja Marató de Barcelona
    expect(at(46, 2300)).toBe("pines"); // Marató del Boumort
    expect(at(42, 2616)).toBe("pines"); // Marató de l'Ultra Pirineu
    expect(at(68, 3600)).toBe("meadows"); // Tenerife Bluetrail
    expect(at(12.3, 501)).toBe("valley"); // Garmin Speed 12K
    expect(at(178, 10000)).toBe("summit"); // UTMB
  });

  it("noms en català o en anglès, sense canviar les fronteres", () => {
    const ca = zones(config, "ca");
    expect(ca.map((z) => z.name)).toEqual([
      "La vall",
      "El bosc",
      "La pineda",
      "Els prats alpins",
      "Les crestes",
      "El cim",
    ]);
    expect(ca.map((z) => z.from)).toEqual(ZONES.map((z) => z.from));
    expect(ZONES[0]!.name).toBe("The valley");
  });

  it("valors per defecte sense arguments", () => {
    expect(zoneForItm(260).key).toBe("pines");
    expect(nextZone(zones()[1]!)!.key).toBe("pines");
  });
});
