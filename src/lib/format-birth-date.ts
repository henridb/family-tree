import type { BirthDate } from "./birth-date";
import { defaultLocale, type AppLocale } from "../i18n/locales.ts";

/** Return the known birth year, or a question mark when the date is unknown. */
export function formatBirthYear(value?: BirthDate): string {
  return value?.slice(0, 4) ?? "?";
}

/**
 * Display known date parts in the locale's order, preserving partial
 * precision and using ? for unknown dates.
 */
export function formatBirthDate(
  value?: BirthDate,
  locale: AppLocale = defaultLocale,
): string {
  if (!value) return "?";
  if (value.length === 4) return value;
  const [year, month, day] = value.split("-");
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day ?? 1));
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    ...(day ? { day: "2-digit" as const } : {}),
  }).formatToParts(date);
  return parts
    .filter((part) => part.type !== "era")
    .map((part) => (part.type === "year" ? year : part.value))
    .join("");
}
