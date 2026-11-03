import type { FamilyPersonInput } from "@/lib/family-document";

export const selectStyle =
  "min-h-10 w-full rounded-md border border-amber-900/25 bg-white px-2 text-sm";
export const fieldStyle = "flex min-w-0 flex-col gap-1 text-sm";

/** Join a person's given and family names, falling back to Sans nom when both are blank. */
export function personLabel(
  person: Pick<FamilyPersonInput, "name" | "surname">,
) {
  return `${person.name} ${person.surname}`.trim() || "Sans nom";
}

/** Generate a permanent editor ID by prefixing a UUID stripped of hyphens. */
export function newId(prefix: string) {
  return prefix + crypto.randomUUID().replaceAll("-", "");
}

/**
 * Return a copy with one element moved by an offset, or the original array if
 * the destination is out of bounds.
 *
 * Callers must supply an existing source index; the input array is never
 * mutated.
 */
export function move<T>(values: T[], index: number, direction: number) {
  const next = [...values];
  const destination = index + direction;
  if (destination < 0 || destination >= next.length) return values;
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return next;
}

/**
 * Build person-selection options with permanent IDs, names and known birth
 * dates or ? for unknown dates.
 */
export function personOptions(people: FamilyPersonInput[]) {
  return people.map((p) => (
    <option key={p.id} value={p.id}>
      {personLabel(p)} ({p.birthdate ?? "?"})
    </option>
  ));
}
