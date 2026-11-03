import assert from "node:assert/strict";
import { test } from "node:test";
import {
  personElementId,
  partnershipElementId,
  validateFamilyIds,
} from "../src/lib/family-identities.ts";

/**
 * Create a minimal fictional person for permanent-identity tests.
 * @param {string} id
 * @returns {import('../src/types/family.ts').human}
 */
const person = (id) => ({ id, name: "?", surname: "Martin", sex: "male" });

test("identical names and absent dates can have distinct, stable identities", () => {
  const first = person("p001"),
    second = person("p002");
  const tree = {
    ...first,
    partners: [{ ...second, children: [person("p003")] }],
  };
  assert.doesNotThrow(() => validateFamilyIds(tree));
  const before = personElementId(first.id);
  first.name = "Corrected name";
  assert.equal(personElementId(first.id), before);
  assert.notEqual(before, personElementId(second.id));
  assert.notEqual(
    partnershipElementId(first.id, second.id, "parents"),
    partnershipElementId(first.id, second.id, "children"),
  );
});

test("duplicate and unsafe source IDs fail before serving the family tree", () => {
  assert.throws(
    () => validateFamilyIds({ ...person("p001"), partners: [person("p001")] }),
    /duplicate/,
  );
  assert.throws(() => validateFamilyIds(person("has spaces")), /Invalid/);
});

test("missing and null IDs are rejected without string coercion", () => {
  const missingId = person("p001");
  delete missingId.id;
  assert.throws(() => validateFamilyIds(missingId), /Invalid/);
  assert.throws(
    () => validateFamilyIds({ ...person("p001"), partners: [person(null)] }),
    /Invalid/,
  );
});
