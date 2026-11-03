import type { human, person } from "../types/family";

export type FamilyPathStep = { person: human; partner?: human };
export type FamilyContext = {
  generation: number;
  path: readonly FamilyPathStep[];
};

/** Return the first partner not marked divorced, or undefined if none exists. */
export function currentPartner(value: person) {
  return value.partners?.find((partner) => !partner.divorced);
}

/**
 * Index each displayed person's generation and path from the supplied root.
 *
 * Partners share a generation; children inherit the path through their own
 * parental union. Paths reference the source records without modifying them.
 * Expects a nested tree with unique person IDs.
 */
export function familyContexts(
  source: person,
): ReadonlyMap<string, FamilyContext> {
  const contexts = new Map<string, FamilyContext>();
  /** Record this person and their partners, then extend each child's parental path. */
  function visit(value: person, ancestors: readonly FamilyPathStep[]) {
    contexts.set(value.id, {
      generation: ancestors.length,
      path: [...ancestors, { person: value }],
    });
    for (const partner of value.partners ?? []) {
      const path = [...ancestors, { person: value, partner }];
      contexts.set(partner.id, { generation: ancestors.length, path });
      partner.children?.forEach((child) => visit(child, path));
    }
  }
  visit(source, []);
  return contexts;
}

/**
 * Format a French generation label from a nonempty path, counting the root as
 * generation one.
 */
export function generationLabel(context: FamilyContext): string {
  const root = context.path[0]!.person;
  return `${context.generation + 1}${context.generation === 0 ? "re" : "e"} génération depuis ${root.name} ${root.surname}`;
}
