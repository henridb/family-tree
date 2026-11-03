import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentPartner,
  familyContexts,
  generationLabel,
} from "../src/lib/family-context.ts";

const family = {
  id: "a",
  name: "Alex",
  surname: "Martin",
  sex: "male",
  partners: [
    {
      id: "b",
      name: "Anne",
      surname: "One",
      sex: "female",
      divorced: true,
      children: [{ id: "c", name: "Clara", surname: "Martin", sex: "female" }],
    },
    {
      id: "d",
      name: "Diane",
      surname: "Two",
      sex: "female",
      children: [
        {
          id: "e",
          name: "Émile",
          surname: "Martin",
          sex: "male",
          partners: [
            {
              id: "f",
              name: "Françoise",
              surname: "Three",
              sex: "female",
              children: [
                {
                  id: "g",
                  name: "Gabriel",
                  surname: "Martin",
                  sex: "male",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Reduce an ancestry context to person/partner ID pairs for readable path assertions.
 * @param {import('../src/lib/family-context.ts').FamilyContext} context
 * @returns {[personId: string, partnerId: string | undefined][]}
 */
function pathIds(context) {
  return context.path.map((step) => [step.person.id, step.partner?.id]);
}

test("ancestry paths retain the correct partnerships for half-siblings and spouses", () => {
  const contexts = familyContexts(family);
  assert.deepEqual(pathIds(contexts.get("c")), [
    ["a", "b"],
    ["c", undefined],
  ]);
  assert.deepEqual(pathIds(contexts.get("e")), [
    ["a", "d"],
    ["e", undefined],
  ]);
  assert.deepEqual(pathIds(contexts.get("f")), [
    ["a", "d"],
    ["e", "f"],
  ]);
  assert.deepEqual(pathIds(contexts.get("g")), [
    ["a", "d"],
    ["e", "f"],
    ["g", undefined],
  ]);
  assert.equal(contexts.get("g").generation, 2);
  assert.equal(contexts.get("f").generation, 1);
  assert.equal(currentPartner(family).id, "d");
});

test("generation labels count the named root as the first generation", () => {
  const contexts = familyContexts(family);
  assert.equal(
    generationLabel(contexts.get("a")),
    "1re génération depuis Alex Martin",
  );
  assert.equal(
    generationLabel(contexts.get("g")),
    "3e génération depuis Alex Martin",
  );
});

test("building contexts accepts frozen source data without changing it", () => {
  const before = structuredClone(family);
  /**
   * Recursively freeze the object fixture so accidental source mutation fails the test.
   * @template {object} T
   * @param {T} value
   * @returns {Readonly<T>} The same object, frozen in place.
   */
  function freeze(value) {
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") freeze(child);
    });
    return Object.freeze(value);
  }
  const source = freeze(structuredClone(family));
  const contexts = familyContexts(source);
  assert.equal(contexts.size, 7);
  assert.deepEqual(source, before);
});
