import assert from "node:assert/strict";
import { test } from "node:test";
import {
  familyGenerationBranches,
  collapseFromGeneration,
} from "../src/lib/family-collapse.ts";

/** @returns {import('../src/types/family.ts').person} A fictional four-generation tree. */
function family() {
  return {
    id: "root",
    name: "Alex",
    surname: "Martin",
    sex: "male",
    partners: [
      {
        id: "partner",
        name: "Bea",
        surname: "Durand",
        sex: "female",
        children: [
          {
            id: "child",
            name: "Cam",
            surname: "Martin",
            sex: "female",
            partners: [
              {
                id: "childpartner",
                name: "Dom",
                surname: "Petit",
                sex: "male",
                children: [
                  {
                    id: "grandchild",
                    name: "Eli",
                    surname: "Petit",
                    sex: "male",
                    partners: [
                      {
                        id: "grandpartner",
                        name: "Flo",
                        surname: "Moreau",
                        sex: "female",
                        children: [
                          {
                            id: "greatgrandchild",
                            name: "Gia",
                            surname: "Petit",
                            sex: "female",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "former",
        name: "Hal",
        surname: "Bernard",
        sex: "female",
        divorced: true,
        children: [
          { id: "otherchild", name: "Iris", surname: "Martin", sex: "female" },
        ],
      },
    ],
  };
}

test("generation levels include leaves and share the same level with partners", () => {
  const levels = familyGenerationBranches(family());
  assert.deepEqual(
    levels.map((level) => [...level]),
    [
      ["descendants-root-partner", "descendants-root-former"],
      ["descendants-child-childpartner"],
      ["descendants-grandchild-grandpartner"],
      [],
    ],
  );
});

test("a cutoff closes all deeper branches while reopening every earlier generation", () => {
  const levels = familyGenerationBranches(family());
  assert.deepEqual(
    [...collapseFromGeneration(levels, 2)],
    [
      "descendants-root-partner",
      "descendants-root-former",
      "descendants-child-childpartner",
      "descendants-grandchild-grandpartner",
    ],
  );
  assert.deepEqual(
    [...collapseFromGeneration(levels, 3)],
    ["descendants-child-childpartner", "descendants-grandchild-grandpartner"],
  );
  assert.deepEqual(
    [...collapseFromGeneration(levels, 4)],
    ["descendants-grandchild-grandpartner"],
  );
  assert.equal(collapseFromGeneration(levels, 5).size, 0);
  assert.equal(collapseFromGeneration(levels, 6).size, 0);
});

test("applying a cutoff preserves source records and creates independent collapse choices", () => {
  const source = family();
  const before = structuredClone(source);
  const levels = familyGenerationBranches(source);
  const first = collapseFromGeneration(levels, 3);
  const independent = collapseFromGeneration(levels, 3);
  // The viewer expands a branch by copying the choices and deleting its ID.
  const expanded = new Set(first);
  expanded.delete("descendants-child-childpartner");
  assert.ok(expanded.has("descendants-grandchild-grandpartner"));
  assert.ok(independent.has("descendants-child-childpartner"));
  assert.deepEqual(first, independent);
  assert.deepEqual(source, before);
  assert.ok(levels[1].has("descendants-child-childpartner"));
});

test("a childless couple and a single person have just one visible generation", () => {
  const source = family();
  for (const partner of source.partners) delete partner.children;
  assert.deepEqual(familyGenerationBranches(source), [new Set()]);
  delete source.partners;
  const levels = familyGenerationBranches(source);
  assert.equal(levels.length, 1);
  assert.equal(collapseFromGeneration(levels, 2).size, 0);
});

test("cutoffs leave the root visible and require whole generations", () => {
  for (const count of [
    0,
    1,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => collapseFromGeneration([], count), RangeError);
});
