import type { human, person } from "../types/family";
import {
  parseFamilyDocument,
  type FamilyDocument,
  type FamilyPartnership,
  type FamilyPartnershipInput,
  type FamilyPersonInput,
} from "./family-document.ts";

type ProjectionErrorCode =
  | "UNKNOWN_ROOT"
  | "REPEATED_PERSON"
  | "PARTNER_BRANCHES"
  | "TOO_MANY_PARTNERSHIPS";

export class FamilyProjectionError extends Error {
  readonly code: ProjectionErrorCode;

  /** Create a projection error with a stable code identifying the unsupported view. */
  constructor(code: ProjectionErrorCode, message: string) {
    super(message);
    this.name = "FamilyProjectionError";
    this.code = code;
  }
}

/** Copy stored fields without carrying view annotations or sharing objects. */
function personRecord(value: human) {
  return {
    id: value.id,
    name: value.name,
    surname: value.surname,
    sex: value.sex,
    ...(value.birthdate === undefined ? {} : { birthdate: value.birthdate }),
    ...(value.dead === undefined ? {} : { dead: value.dead }),
  };
}

/**
 * Validate a document and build the viewer's descendant tree from its selected
 * or overridden root.
 *
 * Return null when the document has no selected root. Preserve person IDs and
 * relationship order while copying records; unconnected people and ancestors
 * remain outside the view.
 *
 * Throw a Zod error for invalid data, or a FamilyProjectionError for an unknown
 * root, repeated displayed person, more than two partnerships on a branch, or
 * additional unions extending a displayed partner's branch. The source document
 * is never modified.
 */
export function projectFamilyDocument(
  value: unknown,
  rootPersonId?: string,
): person | null {
  const document = parseFamilyDocument(value);
  const rootId = rootPersonId ?? document.rootPersonId;
  if (rootId === null) return null;

  const people = new Map(document.people.map((person) => [person.id, person]));
  const rootPerson = people.get(rootId);
  if (!rootPerson) {
    throw new FamilyProjectionError(
      "UNKNOWN_ROOT",
      `Unknown root ID: ${rootId}`,
    );
  }

  const memberships = new Map<string, FamilyPartnership[]>();
  for (const partnership of document.partnerships) {
    for (const id of partnership.personIds) {
      const partnerships = memberships.get(id) ?? [];
      partnerships.push(partnership);
      memberships.set(id, partnerships);
    }
  }

  const root: person = personRecord(rootPerson);
  const seen = new Set([rootId]);
  const projectedPartnerships = new Set<string>();
  const pending = [root];

  /** Copy a referenced person into the view, rejecting a second displayed occurrence. */
  function includePerson(id: string) {
    if (seen.has(id)) {
      throw new FamilyProjectionError(
        "REPEATED_PERSON",
        `Person ${id} would appear more than once in this view.`,
      );
    }
    seen.add(id);
    return personRecord(people.get(id)!);
  }

  for (const branch of pending) {
    const partnerships = memberships.get(branch.id) ?? [];
    // The desktop viewer currently lays out at most two partners per branch.
    // The document can retain additional partnerships, including unplaced ones.
    if (partnerships.length > 2) {
      throw new FamilyProjectionError(
        "TOO_MANY_PARTNERSHIPS",
        `The current viewer supports at most two partnerships for person ${branch.id}.`,
      );
    }
    if (!partnerships.length) continue;

    branch.partners = partnerships.map((partnership) => {
      projectedPartnerships.add(partnership.id);
      const partnerId = partnership.personIds.find((id) => id !== branch.id)!;
      const partner: NonNullable<person["partners"]>[number] = {
        ...includePerson(partnerId),
        ...(partnership.divorced === undefined
          ? {}
          : { divorced: partnership.divorced }),
      };
      if (partnership.childIds.length) {
        partner.children = partnership.childIds.map((id) => includePerson(id));
        pending.push(...partner.children);
      }
      return partner;
    });
  }

  for (const id of seen) {
    for (const partnership of memberships.get(id) ?? []) {
      if (!projectedPartnerships.has(partnership.id)) {
        throw new FamilyProjectionError(
          "PARTNER_BRANCHES",
          `Partnership ${partnership.id} extends a displayed partner's branch; the current viewer cannot show it from root ${rootId}.`,
        );
      }
    }
  }
  return root;
}

type TreeConversionOptions = {
  title?: string;
  createPartnershipId?: () => string;
};

/**
 * Convert a nested tree into a validated version 1 document without modifying
 * the source.
 *
 * Preserve person IDs and partner/child order; assign partnership IDs using the
 * optional factory or generated UUIDs, and start at revision zero. Newly
 * assigned IDs must be retained in later document edits.
 *
 * Reject repeated people or invalid relationships. Search annotations are
 * omitted; empty optional tree lists become empty document collections and are
 * omitted when projected back.
 */
export function familyDocumentFromTree(
  tree: person,
  {
    title = "Arbre familial",
    createPartnershipId = () =>
      `u${globalThis.crypto.randomUUID().replaceAll("-", "")}`,
  }: TreeConversionOptions = {},
): FamilyDocument {
  const people: FamilyPersonInput[] = [];
  const partnerships: FamilyPartnershipInput[] = [];
  const seen = new Set<string>();
  const pending = [tree];

  /** Append a copy of a source person, rejecting identities already encountered. */
  function includePerson(value: human) {
    if (seen.has(value.id)) {
      throw new FamilyProjectionError(
        "REPEATED_PERSON",
        `Duplicate source person ID: ${value.id}`,
      );
    }
    seen.add(value.id);
    people.push(personRecord(value));
  }

  includePerson(tree);
  for (const branch of pending) {
    for (const partner of branch.partners ?? []) {
      includePerson(partner);
      const children = partner.children ?? [];
      children.forEach(includePerson);
      partnerships.push({
        id: createPartnershipId(),
        personIds: [branch.id, partner.id],
        childIds: children.map(({ id }) => id),
        ...(partner.divorced === undefined
          ? {}
          : { divorced: partner.divorced }),
      });
      pending.push(...children);
    }
  }

  return parseFamilyDocument({
    schemaVersion: 1,
    revision: 0,
    title,
    rootPersonId: tree.id,
    people,
    partnerships,
  });
}
