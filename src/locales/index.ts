import { ca } from "./ca";
import { en } from "./en";
import type { ItmLocale } from "./types";

export type { ItmLocale } from "./types";
export { ca, en };

/** Built-in locales. English is the default. */
export const LOCALES = Object.freeze({ en, ca });
export type LocaleCode = keyof typeof LOCALES;

/** A locale code of the package, or a custom locale object. */
export type LocaleInput = LocaleCode | ItmLocale;

export function resolveLocale(locale: LocaleInput | undefined): ItmLocale {
  if (locale === undefined) return en;
  if (typeof locale === "string") {
    // Own keys only: "toString" or "constructor" are not locales.
    if (!Object.hasOwn(LOCALES, locale))
      throw new Error(`Unknown ITM locale "${locale}". Built-in: ${Object.keys(LOCALES).join(", ")}.`);
    return LOCALES[locale];
  }
  return locale;
}
