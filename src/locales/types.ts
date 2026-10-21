import type { ZoneKey } from "../zones";

/**
 * Every user-facing text the package produces. Add a language by writing an object of this shape (see `en.ts`) and
 * passing it as `locale`; nothing else changes.
 */
export type ItmLocale = {
  /** BCP 47 code used for number formatting (`Intl`). */
  code: string;
  /** Name of "level 0" (no level reached yet). */
  noLevel: string;
  events: {
    /** A category run, e.g. "Category run 50K"; `highAltitude` when the altitude bonus was noticeable. */
    categoryRun: (levelLabel: string, highAltitude: boolean) => string;
    /** A non-category run long enough to be listed. */
    run: (highAltitude: boolean) => string;
    weeklyDecay: string;
    levelUp: (levelName: string) => string;
    levelDown: (levelName: string) => string;
  };
  readiness: {
    itm: string;
    longest: string;
    backToBack: string;
    accumulated: string;
    nights: string;
    sleptOut: string;
    support: string;
    previousRace: (levelLabels: string[]) => string;
    /** Value with the km effort unit, e.g. "52 km effort". */
    kmEffort: (rounded: number) => string;
    yes: string;
    no: string;
  };
  zones: Record<ZoneKey, { name: string; tagline: string }>;
};
