import { z } from "zod";

import {
  familyPersonSchema,
  parseFamilyDocument,
  type FamilyDocument,
} from "./family-document.ts";
import {
  familyDocumentFromTree,
  projectFamilyDocument,
} from "./family-projection.ts";
import type { person } from "../types/family";

const formatSchema = z.enum(["document", "tree"]);
const treePersonSchema = familyPersonSchema.extend({
  partners: z.array(z.unknown()).optional(),
});
const treePartnerSchema = familyPersonSchema.extend({
  divorced: z.boolean().default(false),
  children: z.array(z.unknown()).optional(),
});

export type FamilyJsonOptions = {
  format?: z.infer<typeof formatSchema>;
  title?: string;
};

/**
 * Parse a nested value and prefix any Zod issue paths with its location in the
 * original JSON.
 */
function parseAt<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: (string | number)[],
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new z.ZodError(
      result.error.issues.map((issue) => ({
        ...issue,
        path: [...path, ...issue.path],
      })),
    );
  }
  return result.data;
}

/**
 * Validate nested people and relationship arrays before converting them to a
 * typed tree.
 *
 * Use an iterative traversal and retain original JSON paths in validation
 * errors; reject unknown fields rather than silently discarding them.
 */
function parseTree(value: unknown): person {
  const { partners, ...rootPerson } = parseAt(treePersonSchema, value, []);
  const root: person = rootPerson;
  const pending = [{ partners, output: root, path: [] as (string | number)[] }];
  for (const frame of pending) {
    if (!frame.partners) continue;
    frame.output.partners = frame.partners.map((value, index) => {
      const path = [...frame.path, "partners", index];
      const { children, ...partner } = parseAt(treePartnerSchema, value, path);
      const output: NonNullable<person["partners"]>[number] = partner;
      if (children) {
        output.children = children.map((value, index) => {
          const childPath = [...path, "children", index];
          const { partners, ...childPerson } = parseAt(
            treePersonSchema,
            value,
            childPath,
          );
          const child: person = childPerson;
          pending.push({ partners, output: child, path: childPath });
          return child;
        });
      }
      return output;
    });
  }
  return root;
}

/**
 * Parse either a complete family document or a nested person tree into a
 * validated document.
 *
 * Detect the format from top-level document fields unless `format` is supplied.
 * Validate only that format, without falling back after an error. Nested trees
 * receive new partnership IDs, revision zero and the optional title; full
 * documents retain their metadata. Throws for invalid JSON, unsupported formats
 * or invalid family data.
 */
export function importFamilyJson(
  text: string,
  { format, title }: FamilyJsonOptions = {},
): FamilyDocument {
  if (format !== undefined) formatSchema.parse(format);
  const value: unknown = JSON.parse(text);
  const documentShape =
    typeof value === "object" &&
    value !== null &&
    ("schemaVersion" in value || "people" in value || "partnerships" in value);
  const detectedFormat = format ?? (documentShape ? "document" : "tree");
  return detectedFormat === "document"
    ? parseFamilyDocument(value)
    : familyDocumentFromTree(parseTree(value), { title });
}

/**
 * Serialize a validated family document as indented JSON with a trailing
 * newline.
 *
 * The default document format preserves all records and metadata. A tree export
 * includes only the selected descendant view and throws if no root is selected
 * or the viewer cannot represent it. Does not mutate the input.
 */
export function exportFamilyJson(
  value: unknown,
  { format = "document" }: FamilyJsonOptions = {},
): string {
  formatSchema.parse(format);
  const document = parseFamilyDocument(value);
  const output =
    format === "document" ? document : projectFamilyDocument(document);
  if (output === null)
    throw new Error("Select a root before exporting a nested tree.");
  return `${JSON.stringify(output, null, 2)}\n`;
}
