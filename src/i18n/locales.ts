export const locales = ["fr-FR", "en-US"] as const;
export type AppLocale = (typeof locales)[number];
export const languageModes = ["choice", ...locales] as const;
export type LanguageMode = (typeof languageModes)[number];
export const localeNames: Record<AppLocale, string> = {
  "fr-FR": "Français",
  "en-US": "English",
};
export const defaultLocale: AppLocale = "fr-FR";
export const localeCookie = "family-tree-locale";

/** Accept only supported locale identifiers, including for untrusted cookies. */
export function isLocale(value: unknown): value is AppLocale {
  return (locales as readonly unknown[]).includes(value);
}

/** Enforce a fixed language, otherwise prefer the visitor choice and installation default. */
export function resolveLocale(
  choice?: string,
  installation?: string,
  mode: LanguageMode = "choice",
): AppLocale {
  if (mode !== "choice") return mode;
  return isLocale(choice)
    ? choice
    : isLocale(installation)
      ? installation
      : defaultLocale;
}
