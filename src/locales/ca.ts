import type { ItmLocale } from "./types";

const altitud = (high: boolean) => (high ? " en altitud" : "");

/** Català: els textos originals d'isardtrail.com. */
export const ca: ItmLocale = {
  code: "ca",
  noLevel: "Sense nivell",
  events: {
    categoryRun: (label, high) => `Sortida de categoria ${label}${altitud(high)}`,
    run: (high) => `Sortida de córrer${altitud(high)}`,
    weeklyDecay: "Deteriorament de la setmana",
    levelUp: (name) => `Nivell ${name}`,
    levelDown: (name) => `Baixa a ${name}`,
  },
  readiness: {
    itm: "Forma (ITM)",
    longest: "Sortida més llarga (12 setmanes)",
    backToBack: "Doblet: dos dies seguits",
    accumulated: "Acumulat (12 setmanes)",
    nights: "Sortides de nit (12 mesos)",
    sleptOut: "Nit fora (12 mesos)",
    support: "Mobilitat o força (per setmana, 8 setmanes)",
    previousRace: (labels) => `Cursa acabada: ${labels.join(" o ")} (24 mesos)`,
    kmEffort: (n) => `${n} km esf.`,
    yes: "Sí",
    no: "No",
  },
  zones: {
    valley: { name: "La vall", tagline: "Prats, rius i pobles. Tot comença aquí baix." },
    forest: { name: "El bosc", tagline: "Fagedes i rouredes: les primeres pujades llargues." },
    pines: { name: "La pineda", tagline: "Pi negre i corriols drets. Aquí comencen les ultres." },
    meadows: { name: "Els prats alpins", tagline: "Herba curta, estanys i el xiulet de les marmotes." },
    ridges: { name: "Les crestes", tagline: "Roca, tartera i neu: el territori de l'isard." },
    summit: { name: "El cim", tagline: "Glacera i cel obert. El nivell de l'UTMB." },
  },
};
