import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFamilyDocument } from "../src/lib/family-document.ts";
import { exportFamilyJson, importFamilyJson } from "../src/lib/family-json.ts";
import { exampleFamily } from "./helpers/family-store-fixtures.mjs";

test("full JSON exports preserve unconnected people, identities and metadata", () => {
  const family = exampleFamily();
  const before = structuredClone(family);
  const exported = exportFamilyJson(family);
  assert.deepEqual(importFamilyJson(exported), parseFamilyDocument(family));
  assert.deepEqual(family, before);
});

test("document exports retain child order while tree exports order siblings by birth date", () => {
  const family = exampleFamily();
  family.people.push({
    id: "older",
    name: "Robin",
    surname: "Martin",
    sex: "male",
    birthdate: "1960",
  });
  family.partnerships[0].childIds = ["unconnected", "cam", "older"];
  const before = structuredClone(family);
  const exportedDocument = JSON.parse(exportFamilyJson(family));
  const exportedTree = JSON.parse(exportFamilyJson(family, { format: "tree" }));
  assert.deepEqual(exportedDocument.partnerships[0].childIds, [
    "unconnected",
    "cam",
    "older",
  ]);
  assert.deepEqual(
    exportedTree.partners[0].children.map(({ id }) => id),
    ["older", "cam", "unconnected"],
  );
  assert.deepEqual(family, before);
});

test("handwritten nested JSON validates and round-trips known fields and defaults", () => {
  const text =
    '{"id":"alex","name":"Alex","surname":"Martin","sex":"male","birthdate":"1940","partners":[{"id":"bea","name":"Beatrice","surname":"Durand","sex":"female","children":[{"id":"cam","name":"Camille","surname":"Martin","sex":"female","birthdate":"1970-02"}]}]}';
  const document = importFamilyJson(text, {
    title: "Handwritten",
  });
  assert.equal(document.title, "Handwritten");
  assert.equal(document.revision, 0);
  const tree = JSON.parse(exportFamilyJson(document, { format: "tree" }));
  assert.equal(tree.birthdate, "1940");
  assert.equal(tree.dead, false);
  assert.equal(tree.partners[0].divorced, false);
  assert.equal(tree.partners[0].children[0].birthdate, "1970-02");
  assert.deepEqual(
    JSON.parse(
      exportFamilyJson(
        importFamilyJson(JSON.stringify(tree), { format: "tree" }),
        { format: "tree" },
      ),
    ),
    tree,
  );
});

test("automatic detection accepts a nested tree consisting of a single person", () => {
  const root = exampleFamily().people[0];
  const document = importFamilyJson(JSON.stringify(root));
  assert.equal(document.rootPersonId, root.id);
  assert.deepEqual(document.people, [{ ...root, dead: false }]);
  assert.deepEqual(document.partnerships, []);
});

test("automatic detection rejects malformed and mixed shapes without a fallback", () => {
  const root = exampleFamily().people[0];
  for (const value of [
    null,
    [],
    {},
    { ...exampleFamily(), schemaVersion: 2 },
    { ...exampleFamily(), people: null },
    { ...root, schemaVersion: 1 },
    { ...root, partners: "wrong" },
  ]) {
    assert.throws(() => importFamilyJson(JSON.stringify(value)));
  }
  assert.throws(() =>
    importFamilyJson(JSON.stringify(root), { format: "document" }),
  );
  assert.throws(() =>
    importFamilyJson(JSON.stringify(exampleFamily()), { format: "tree" }),
  );
});

test("nested import rejects malformed containers and reports the original field path", () => {
  for (const [value, path] of [
    [null, []],
    [{ ...exampleFamily().people[0], partners: "wrong" }, ["partners"]],
    [{ ...exampleFamily().people[0], partners: [null] }, ["partners", 0]],
    [
      {
        ...exampleFamily().people[0],
        partners: [{ ...exampleFamily().people[1], children: null }],
      },
      ["partners", 0, "children"],
    ],
    [
      {
        ...exampleFamily().people[0],
        partners: [
          {
            ...exampleFamily().people[1],
            children: [
              { ...exampleFamily().people[2], birthdate: "2001-02-29" },
            ],
          },
        ],
      },
      ["partners", 0, "children", 0, "birthdate"],
    ],
  ]) {
    assert.throws(
      () => importFamilyJson(JSON.stringify(value), { format: "tree" }),
      (error) =>
        error.issues?.some(
          (issue) => JSON.stringify(issue.path) === JSON.stringify(path),
        ),
    );
  }
});

test("imports reject unknown fields, invalid format options and invalid JSON", () => {
  const tree = { ...exampleFamily().people[0], birthdtae: "1940" };
  assert.throws(() =>
    importFamilyJson(JSON.stringify(tree), { format: "tree" }),
  );
  assert.throws(() => importFamilyJson(JSON.stringify(tree)));
  assert.throws(() => importFamilyJson("{}", { format: "unknown" }));
  assert.throws(() => importFamilyJson("{"));
});

test("an unselected root can be exported as a full document only", () => {
  const document = { ...exampleFamily(), rootPersonId: null };
  assert.deepEqual(
    importFamilyJson(exportFamilyJson(document)),
    parseFamilyDocument(document),
  );
  assert.throws(
    () => exportFamilyJson(document, { format: "tree" }),
    /Select a root/,
  );
});
