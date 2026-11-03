import type { BirthDate } from "./birth-date";

/** Return the known birth year, or a question mark when the date is unknown. */
export function formatBirthYear(value?: BirthDate): string {
  return value?.slice(0, 4) ?? "?";
}

/**
 * Display known date parts in day/month/year order, preserving partial
 * precision and using ? for unknown dates.
 */
export function formatBirthDate(value?: BirthDate): string {
  return value?.split("-").reverse().join("/") ?? "?";
}
