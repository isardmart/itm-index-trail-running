import type { ItmLocale } from "./types";

const altitude = (high: boolean) => (high ? " at altitude" : "");

/** English (default). */
export const en: ItmLocale = {
  code: "en",
  noLevel: "No level",
  events: {
    categoryRun: (label, high) => `Category run ${label}${altitude(high)}`,
    run: (high) => `Run${altitude(high)}`,
    weeklyDecay: "Weekly decay",
    levelUp: (name) => `Level ${name}`,
    levelDown: (name) => `Down to ${name}`,
  },
  readiness: {
    itm: "Fitness (ITM)",
    longest: "Longest run (12 weeks)",
    backToBack: "Back-to-back: two consecutive days",
    accumulated: "Accumulated (12 weeks)",
    nights: "Night runs (12 months)",
    sleptOut: "Nights out (12 months)",
    support: "Mobility or strength (per week, 8 weeks)",
    previousRace: (labels) => `Finished race: ${labels.join(" or ")} (24 months)`,
    kmEffort: (n) => `${n} km effort`,
    yes: "Yes",
    no: "No",
  },
  zones: {
    valley: { name: "The valley", tagline: "Meadows, rivers and villages. Everything starts down here." },
    forest: { name: "The forest", tagline: "Beech and oak woods: the first long climbs." },
    pines: { name: "The pine forest", tagline: "Mountain pines and steep trails. Ultras start here." },
    meadows: { name: "The alpine meadows", tagline: "Short grass, lakes and the whistle of marmots." },
    ridges: { name: "The ridges", tagline: "Rock, scree and snow: the land of the isard." },
    summit: { name: "The summit", tagline: "Glacier and open sky. The UTMB level." },
  },
};
