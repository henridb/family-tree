export const locales = ["fr-FR", "en-US"] as const;
export type AppLocale = (typeof locales)[number];
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

/** Prefer an explicit visitor choice, then the installation default, then French. */
export function resolveLocale(
  choice?: string,
  installation?: string,
): AppLocale {
  return isLocale(choice)
    ? choice
    : isLocale(installation)
      ? installation
      : defaultLocale;
}
