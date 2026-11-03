import type { person } from "../types/family";

/** Build a person's DOM ID from their permanent family ID. */
export function personElementId(id: string): string {
  return `person-${id}`;
}

/** Build a connector or descendant-region ID for an ordered owner/partner pair. */
export function partnershipElementId(
  ownerId: string,
  partnerId: string,
  part: "parents" | "children" | "descendants",
): string {
  return `${part}-${ownerId}-${partnerId}`;
}

/**
 * Check that every person and partner has a unique lowercase alphanumeric ID
 * starting with a letter.
 *
 * Walk the complete nested tree without modifying it; throw on the first
 * invalid or repeated identity.
 */
export function validateFamilyIds(tree: person): void {
  const seen = new Set<string>();
  /** Register the branch and its partners before checking their descendants. */
  function visit(value: person) {
    for (const human of [value, ...(value.partners ?? [])]) {
      if (
        typeof human.id !== "string" ||
        !/^[a-z][a-z0-9]*$/.test(human.id) ||
        seen.has(human.id)
      ) {
        throw new Error(`Invalid or duplicate family ID: ${human.id}`);
      }
      seen.add(human.id);
    }
    for (const partner of value.partners ?? []) {
      partner.children?.forEach(visit);
    }
  }
  visit(tree);
}
