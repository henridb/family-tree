import { z } from "zod";

// Birth dates are calendar values, with only the precision known in the source.
export const birthDateSchema = z
  .union([z.iso.date(), z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/)])
  .brand<"BirthDate">();

export type BirthDate = z.infer<typeof birthDateSchema>;

/**
 * Validate a year, year-month, or calendar date and retain its original
 * precision.
 *
 * Throws a Zod validation error for invalid values; no timezone or missing date
 * parts are inferred.
 */
export function birthDate(value: string): BirthDate {
  return birthDateSchema.parse(value);
}
