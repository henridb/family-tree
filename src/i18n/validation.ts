import { ZodError } from "zod";
import { FamilyProjectionError } from "../lib/family-projection.ts";

const validationKeys = [
  "title",
  "duplicatePerson",
  "unknownPerson",
  "duplicateUnion",
  "differentPeople",
  "duplicatePair",
  "duplicateChild",
  "selfParent",
  "multipleParents",
  "cycle",
] as const;
type ValidationKey = (typeof validationKeys)[number];
type Feedback = {
  key:
    | `validation.${ValidationKey}`
    | `validation.${FamilyProjectionError["code"]}`
    | "validation.invalid";
  values: { id: string };
};

/** Present short localized feedback while keeping raw diagnostics available separately. */
export function validationFeedback(error: unknown): Feedback | null {
  if (error instanceof FamilyProjectionError)
    return { key: `validation.${error.code}`, values: { id: "" } };
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (issue?.code === "custom") {
      const key: unknown = issue.params?.messageKey;
      if (
        typeof key === "string" &&
        validationKeys.some((value) => value === key)
      )
        return {
          key: `validation.${key as ValidationKey}`,
          values: {
            id: typeof issue.params?.id === "string" ? issue.params.id : "",
          },
        };
    }
  }
  return { key: "validation.invalid", values: { id: "" } };
}
