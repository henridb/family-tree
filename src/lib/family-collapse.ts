import type { person } from "../types/family";
import { partnershipElementId } from "./family-identities.ts";

/** Index expandable branches by generation, including empty levels for leaves. */
export function familyGenerationBranches(tree: person): ReadonlySet<string>[] {
  const levels: Set<string>[] = [];
  const pending = [{ person: tree, generation: 0 }];
  for (const { person, generation } of pending) {
    const branches = (levels[generation] ??= new Set());
    for (const partner of person.partners ?? []) {
      if (!partner.children?.length) continue;
      branches.add(partnershipElementId(person.id, partner.id, "descendants"));
      for (const child of partner.children)
        pending.push({ person: child, generation: generation + 1 });
    }
  }
  return levels;
}

/**
 * Return fresh collapse choices that hide generation N and every later one.
 * Close every branch at or below the boundary so individual expansion reveals
 * one more generation at a time. The root and partners count as generation one.
 */
export function collapseFromGeneration(
  levels: readonly ReadonlySet<string>[],
  firstHiddenGeneration: number,
): ReadonlySet<string> {
  if (!Number.isSafeInteger(firstHiddenGeneration) || firstHiddenGeneration < 2)
    throw new RangeError(
      "The first hidden generation must be an integer of at least two.",
    );
  const collapsed = new Set<string>();
  for (const branches of levels.slice(firstHiddenGeneration - 2))
    for (const id of branches) collapsed.add(id);
  return collapsed;
}
