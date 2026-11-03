import { z } from "zod";

import { birthDateSchema } from "./birth-date.ts";

const familyIdSchema = z.string().regex(/^[a-z][a-z0-9]*$/);

/** Authoritative person fields; search and display annotations belong to a view. */
export const familyPersonSchema = z.strictObject({
  id: familyIdSchema,
  name: z.string(),
  surname: z.string(),
  sex: z.enum(["male", "female"]),
  birthdate: birthDateSchema.optional(),
  dead: z.boolean().default(false),
});

export const familyPartnershipSchema = z.strictObject({
  id: familyIdSchema,
  personIds: z.tuple([familyIdSchema, familyIdSchema]),
  childIds: z.array(familyIdSchema),
  divorced: z.boolean().default(false),
});

const documentShape = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  title: z.string().refine((title) => title.trim().length > 0, {
    message: "The family title must not be blank.",
  }),
  rootPersonId: familyIdSchema.nullable(),
  people: z.array(familyPersonSchema),
  partnerships: z.array(familyPartnershipSchema),
});

export type FamilyPerson = z.infer<typeof familyPersonSchema>;
export type FamilyPersonInput = z.input<typeof familyPersonSchema>;
export type FamilyPartnership = z.infer<typeof familyPartnershipSchema>;
export type FamilyPartnershipInput = z.input<typeof familyPartnershipSchema>;
export type FamilyDocument = z.infer<typeof documentShape>;
export type FamilyDocumentInput = z.input<typeof documentShape>;

/** Validate the complete document, including records outside the selected view. */
export const familyDocumentSchema = documentShape.superRefine(
  (document, ctx) => {
    const people = new Set<string>();
    document.people.forEach((person, index) => {
      if (people.has(person.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["people", index, "id"],
          message: `Duplicate person ID: ${person.id}`,
        });
      }
      people.add(person.id);
    });

    /** Add a validation issue at the supplied field path if the person ID is unknown. */
    function requirePerson(id: string, path: (string | number)[]) {
      if (!people.has(id)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Unknown person ID: ${id}`,
        });
      }
    }

    if (document.rootPersonId !== null) {
      requirePerson(document.rootPersonId, ["rootPersonId"]);
    }

    const partnerships = new Set<string>();
    const pairs = new Set<string>();
    const parentPartnerships = new Map<string, string>();
    const descendants = new Map<string, string[]>();
    const parentCounts = new Map(document.people.map(({ id }) => [id, 0]));

    document.partnerships.forEach((partnership, index) => {
      const path = ["partnerships", index];
      if (partnerships.has(partnership.id)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "id"],
          message: `Duplicate partnership ID: ${partnership.id}`,
        });
      }
      partnerships.add(partnership.id);

      if (partnership.personIds[0] === partnership.personIds[1]) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "personIds"],
          message: "A partnership must contain two different people.",
        });
      }
      const pair = JSON.stringify([...partnership.personIds].sort());
      if (pairs.has(pair)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "personIds"],
          message: "The same two people must share one partnership record.",
        });
      }
      pairs.add(pair);
      partnership.personIds.forEach((id, position) =>
        requirePerson(id, [...path, "personIds", position]),
      );

      const children = new Set<string>();
      partnership.childIds.forEach((id, position) => {
        const childPath = [...path, "childIds", position];
        requirePerson(id, childPath);
        if (children.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: childPath,
            message: `Duplicate child ID: ${id}`,
          });
        }
        children.add(id);
        if (partnership.personIds.includes(id)) {
          ctx.addIssue({
            code: "custom",
            path: childPath,
            message: "A person cannot be their own parent.",
          });
        }
        const previous = parentPartnerships.get(id);
        if (previous !== undefined && previous !== partnership.id) {
          ctx.addIssue({
            code: "custom",
            path: childPath,
            message: "Version 1 supports one parental partnership per child.",
          });
        }
        parentPartnerships.set(id, partnership.id);

        // Count parent edges for an iterative ancestry-cycle check. Unresolved
        // references are already reported above and must not enter this graph.
        for (const parentId of partnership.personIds) {
          if (!people.has(parentId) || !people.has(id)) continue;
          const children = descendants.get(parentId) ?? [];
          children.push(id);
          descendants.set(parentId, children);
          parentCounts.set(id, parentCounts.get(id)! + 1);
        }
      });
    });

    const ready = [...parentCounts]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    for (const id of ready) {
      for (const childId of descendants.get(id) ?? []) {
        const remaining = parentCounts.get(childId)! - 1;
        parentCounts.set(childId, remaining);
        if (remaining === 0) ready.push(childId);
      }
    }
    if (ready.length !== people.size) {
      ctx.addIssue({
        code: "custom",
        path: ["partnerships"],
        message:
          "Parent-child relationships must not contain an ancestry cycle.",
      });
    }
  },
);

/**
 * Return a validated copy of a version 1 family document with omitted flags
 * defaulted to false.
 *
 * Check identities, references, parental unions and ancestry cycles across all
 * records, including unconnected people. Throw a Zod error for invalid input
 * without mutating it; viewer-specific layout limits are checked separately by
 * the projection.
 */
export function parseFamilyDocument(value: unknown): FamilyDocument {
  return familyDocumentSchema.parse(value);
}
