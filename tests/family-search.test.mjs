import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findNameMatches,
  normalizeName,
  searchFamily,
} from "../src/lib/family-search.ts";

/**
 * Extract the original text fragments covered by search-match ranges.
 * @param {string} text
 * @param {readonly import('../src/types/family.ts').TextMatch[]} ranges
 * @returns {string[]}
 */
function highlightedText(text, ranges) {
  return ranges.map(({ start, end }) => text.slice(start, end));
}

for (const [label, text, queries, expected] of [
  ["accented spelling", "Amélie", ["amelie"], ["Amélie"]],
  ["combining accents", "Ame\u0301lie", ["ame"], ["Ame\u0301"]],
  [
    "ligatures and punctuation",
    "Œuvre d’Ægir",
    ["oeuvre d’aegir"],
    ["Œuvre d’Ægir"],
  ],
  ["partial ligatures", "Œuvre", ["o", "e"], ["Œ", "e"]],
  ["original spacing", "  Amélie \t Béjot ", ["amelie bej"], ["Amélie \t Béj"]],
  ["surrogate pairs", "𐐀mé", ["me"], ["mé"]],
  ["contextual case folding", "ΟΣ", ["ΟΣ"], ["ΟΣ"]],
]) {
  test(`highlight ranges preserve ${label}`, () => {
    const matches = findNameMatches(text, queries.map(normalizeName));
    assert.deepEqual(highlightedText(text, matches), expected);
    let cursor = 0;
    let reconstructed = "";
    for (const { start, end } of matches) {
      reconstructed += text.slice(cursor, start) + text.slice(start, end);
      cursor = end;
    }
    assert.equal(reconstructed + text.slice(cursor), text);
  });
}

test("overlapping highlight ranges merge without duplicate text", () => {
  assert.deepEqual(findNameMatches("banana", ["ana", "nan", "ana"]), [
    { start: 1, end: 6 },
  ]);
  assert.deepEqual(findNameMatches("Amélie", ["", "absent"]), []);
});

const family = {
  id: "s1",
  name: "André",
  surname: "Martin",
  sex: "male",
  partners: [
    {
      id: "s2",
      name: "Amélie",
      surname: "Béjot",
      sex: "female",
      children: [{ id: "zoe", name: "Zoë", surname: "Martin", sex: "female" }],
    },
    {
      id: "s3",
      name: "Ève",
      surname: "Durand",
      sex: "female",
      divorced: true,
    },
  ],
};

test("French search ignores case, accents, ligatures and extra whitespace", () => {
  assert.equal(normalizeName("  ŒUVRE   d’Ægir  "), "oeuvre d’aegir");
  for (const query of [
    "Amélie Béjot",
    " AMELIE   BEJOT ",
    "Ame\u0301lie Be\u0301jot",
  ]) {
    const result = searchFamily(family, query);
    assert.equal(result.matchCount, 1);
    assert.equal(result.tree.partners[0].match, true);
    assert.equal(result.tree.match, false);
  }
});

test("search retains ancestors without counting them as matching people", () => {
  const result = searchFamily(family, "zoe");
  assert.equal(result.matchCount, 1);
  assert.equal(result.tree.match, false);
  assert.equal(result.tree.partners[0].children[0].match, true);
  assert.equal(searchFamily(family, "no such person").matchCount, 0);
});

test("semicolon-separated searches retain matches from different partnerships", () => {
  const source = structuredClone(family);
  source.partners[1].children = [
    { id: "lea", name: "Léa", surname: "Martin", sex: "female" },
  ];
  const result = searchFamily(source, "  ZOE ; absent ; LEA ;; ");
  assert.equal(result.matchCount, 2);
  assert.equal(result.tree.match, false);
  assert.deepEqual(
    result.tree.partners.map((partner) =>
      partner.children.map((child) => [child.id, child.match]),
    ),
    [[["zoe", true]], [["lea", true]]],
  );
});

test("overlapping queries and surname aliases count each person once", () => {
  const result = searchFamily(
    family,
    "Amélie Martin; BEJOT; zoe; AMELIE MARTIN",
  );
  assert.equal(result.matchCount, 2);
  assert.equal(result.tree.partners[0].match, true);
  assert.equal(result.tree.partners[0].children[0].match, true);
  assert.equal(searchFamily(family, "absent; nobody").matchCount, 0);
});

test("birth surnames and current married surnames match, former spouses do not supply an alias", () => {
  assert.equal(searchFamily(family, "amelie martin").matchCount, 1);
  assert.equal(searchFamily(family, "amelie bejot").matchCount, 1);
  assert.equal(searchFamily(family, "eve martin").matchCount, 0);
  assert.equal(searchFamily(family, "eve durand").matchCount, 1);
  const wife = {
    id: "s4",
    name: "Anne",
    surname: "Dupont",
    sex: "female",
    partners: [{ id: "jean", name: "Jean", surname: "Martin", sex: "male" }],
  };
  assert.equal(searchFamily(wife, "anne martin").matchCount, 1);
  assert.equal(searchFamily(wife, "jean dupont").matchCount, 0);
});

test("full-name matches project onto first, birth, and married names", () => {
  const birth = searchFamily(family, "lie be").tree.partners[0];
  assert.deepEqual(highlightedText(birth.name, birth.searchHighlights.name), [
    "lie",
  ]);
  assert.deepEqual(
    highlightedText(birth.surname, birth.searchHighlights.surname),
    ["Bé"],
  );
  assert.deepEqual(birth.searchHighlights.marriedSurname, []);

  const married = searchFamily(family, "amelie martin").tree.partners[0];
  assert.deepEqual(
    highlightedText(married.name, married.searchHighlights.name),
    ["Amélie"],
  );
  assert.deepEqual(
    highlightedText("Martin", married.searchHighlights.marriedSurname),
    ["Martin"],
  );
  assert.deepEqual(married.searchHighlights.surname, []);

  const both = searchFamily(family, "amelie bejot; amelie martin").tree
    .partners[0];
  assert.deepEqual(highlightedText(both.name, both.searchHighlights.name), [
    "Amélie",
  ]);
  assert.deepEqual(
    highlightedText(both.surname, both.searchHighlights.surname),
    ["Béjot"],
  );
  assert.deepEqual(
    highlightedText("Martin", both.searchHighlights.marriedSurname),
    ["Martin"],
  );
});

test("clearing search restores the full tree without mutating source records", () => {
  const before = structuredClone(family);
  const filtered = searchFamily(family, "zoe");
  assert.deepEqual(family, before);
  filtered.tree.name = "Changed result";
  assert.deepEqual(family, before);
  const cleared = searchFamily(family, " ; \t ;; ");
  assert.equal(cleared.hasQuery, false);
  assert.deepEqual(cleared.tree, family);
  assert.notEqual(cleared.tree, family);
  assert.notEqual(cleared.tree.partners, family.partners);
  assert.notEqual(
    cleared.tree.partners[0].children[0],
    family.partners[0].children[0],
  );
  assert.notEqual(filtered.tree.partners[0], family.partners[0]);
});

test("search accepts frozen input and clears old matches and highlights", () => {
  /**
   * Recursively freeze the fixture to detect mutation during repeated searches.
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
  assert.equal(searchFamily(source, "zoe").matchCount, 1);
  const filtered = searchFamily(source, "martin");
  const before = structuredClone(filtered.tree);
  const frozenResult = freeze(filtered.tree);
  const next = searchFamily(frozenResult, "eve");
  assert.equal(next.tree.searchHighlights, undefined);
  assert.equal(next.tree.partners[0].searchHighlights, undefined);
  const cleared = searchFamily(frozenResult, "");
  assert.equal(cleared.tree.match, undefined);
  assert.equal(cleared.tree.partners[0].match, undefined);
  assert.equal(cleared.tree.searchHighlights, undefined);
  assert.equal(cleared.tree.partners[0].searchHighlights, undefined);
  assert.deepEqual(frozenResult, before);
});
