import assert from "node:assert/strict";
import { test } from "node:test";

import { birthDate } from "../src/lib/birth-date.ts";
import {
  familyDocumentSchema,
  parseFamilyDocument,
} from "../src/lib/family-document.ts";
import {
  FamilyProjectionError,
  familyDocumentFromTree,
  projectFamilyDocument,
} from "../src/lib/family-projection.ts";
import { familyContexts } from "../src/lib/family-context.ts";
import { validateFamilyIds } from "../src/lib/family-identities.ts";

/**
 * Create a fictional person with explicit defaults and caller-supplied field overrides.
 * @param {string} id
 * @param {Partial<import('../src/types/family.ts').human>} [fields={}]
 * @returns {import('../src/types/family.ts').human}
 */
const human = (id, fields = {}) => ({
  id,
  name: "Alex",
  surname: "Martin",
  sex: "male",
  dead: false,
  ...fields,
});

// Fictional people cover source names, half-siblings, remarriage, missing dates,
// all supported date precisions, and explicit false flags.
const tree = {
  ...human("alex", { birthdate: birthDate("1940"), dead: true }),
  partners: [
    {
      ...human("bea", {
        name: "Béatrice",
        surname: "Durand",
        sex: "female",
        birthdate: birthDate("1942-02"),
      }),
      divorced: false,
      children: [
        {
          ...human("cam", { birthdate: birthDate("1965-02-28") }),
          partners: [
            {
              ...human("dom", { sex: "female" }),
              divorced: false,
              children: [human("eli", { dead: false })],
            },
          ],
        },
        human("flo", { name: "", surname: "" }),
      ],
    },
    {
      ...human("gia", { sex: "female" }),
      divorced: true,
      children: [human("hal")],
    },
  ],
};

/**
 * Convert the fictional nested tree into a fresh document with deterministic
 * partnership IDs.
 * @returns {import('../src/lib/family-document.ts').FamilyDocument}
 */
function document() {
  let nextId = 0;
  return familyDocumentFromTree(tree, {
    title: "Famille exemple",
    /**
     * Assign consecutive partnership IDs so the converted test document is reproducible.
     * @returns {string}
     */
    createPartnershipId: () => `u${++nextId}`,
  });
}

/**
 * Recursively freeze an object fixture without changing primitive values.
 * @template T
 * @param {T} value
 * @returns {Readonly<T>} The same value, with objects frozen in place.
 */
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Assert that document validation reports the expected field path and optional
 * message fragment.
 * @param {unknown} value Potentially malformed input under test.
 * @param {(string | number)[]} path Expected original field path.
 * @param {string} [message] Optional substring of the diagnostic.
 * @returns {void}
 */
function assertInvalid(value, path, message) {
  const result = familyDocumentSchema.safeParse(value);
  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) =>
        JSON.stringify(issue.path) === JSON.stringify(path) &&
        (!message || issue.message.includes(message)),
    ),
    JSON.stringify(result.error.issues),
  );
}

for (const [collection, flag] of [
  ["people", "dead"],
  ["partnerships", "divorced"],
]) {
  test(`${flag} defaults at parsing without changing the supplied records`, () => {
    for (const inputFlag of [
      {},
      { [flag]: undefined },
      { [flag]: false },
      { [flag]: true },
    ]) {
      const stored = document();
      delete stored[collection][0][flag];
      Object.assign(stored[collection][0], inputFlag);
      const before = structuredClone(stored);
      const parsed = parseFamilyDocument(freeze(stored));
      assert.equal(parsed[collection][0][flag], inputFlag[flag] ?? false);
      assert.deepEqual(stored, before);
      assert.equal(
        JSON.parse(JSON.stringify(parsed))[collection][0][flag],
        inputFlag[flag] ?? false,
      );
    }
    const invalid = document();
    invalid[collection][0][flag] = null;
    assertInvalid(invalid, [collection, 0, flag]);
  });
}

test("nested trees with omitted marker flags round-trip to explicit false values", () => {
  const source = { ...human("one"), partners: [human("two")] };
  delete source.dead;
  const before = structuredClone(source);
  const stored = familyDocumentFromTree(freeze(source));
  assert.equal(stored.people[0].dead, false);
  assert.equal(stored.partnerships[0].divorced, false);
  assert.deepEqual(projectFamilyDocument(stored), {
    ...human("one"),
    partners: [{ ...human("two"), divorced: false }],
  });
  assert.deepEqual(source, before);
});

test("a fictional legacy tree round-trips with its identities, ordering and dates", () => {
  const source = freeze(structuredClone(tree));
  const stored = document();
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.revision, 0);
  assert.equal(stored.title, "Famille exemple");
  assert.equal(stored.rootPersonId, "alex");
  const restored = projectFamilyDocument(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(restored, source);
  assert.doesNotThrow(() => validateFamilyIds(restored));
  assert.deepEqual(familyContexts(restored), familyContexts(source));
  assert.deepEqual(
    projectFamilyDocument(familyDocumentFromTree(restored)),
    source,
  );
});

test("unconnected people and partnerships are valid and retained outside the view", () => {
  const stored = document();
  stored.people.push(human("ivy"), human("jo"));
  stored.partnerships.push({
    id: "unplaced",
    personIds: ["ivy", "jo"],
    childIds: [],
  });
  assert.equal(parseFamilyDocument(stored).people.length, treeCount(tree) + 2);
  assert.deepEqual(projectFamilyDocument(stored), tree);
  assert.deepEqual(projectFamilyDocument(stored, "ivy"), {
    ...human("ivy"),
    partners: [{ ...human("jo"), divorced: false }],
  });
});

/**
 * Count all branch and partner records in a nested test tree.
 * @param {import('../src/types/family.ts').person} value
 * @returns {number}
 */
function treeCount(value) {
  return (
    1 +
    (value.partners ?? []).reduce(
      (count, partner) =>
        count +
        1 +
        (partner.children ?? []).reduce((n, child) => n + treeCount(child), 0),
      0,
    )
  );
}

test("empty documents and records awaiting root selection return no tree", () => {
  for (const people of [[], [human("unplaced")]]) {
    const stored = {
      schemaVersion: 1,
      revision: 0,
      title: "Nouvelle famille",
      rootPersonId: null,
      people,
      partnerships: [],
    };
    assert.deepEqual(parseFamilyDocument(stored), stored);
    assert.equal(projectFamilyDocument(stored), null);
    if (people.length) {
      assert.deepEqual(projectFamilyDocument(stored, "unplaced"), people[0]);
    }
  }
});

test("selected subtrees omit ancestors without changing the stored root", () => {
  const stored = document();
  assert.deepEqual(
    projectFamilyDocument(stored, "cam"),
    tree.partners[0].children[0],
  );
  assert.equal(stored.rootPersonId, "alex");
  assert.deepEqual(
    projectFamilyDocument(stored, "flo"),
    tree.partners[0].children[1],
  );
});

test("participant position does not determine gender, parent role or projection", () => {
  const stored = document();
  stored.partnerships.forEach((partnership) => partnership.personIds.reverse());
  assert.deepEqual(projectFamilyDocument(stored), tree);
  const couple = {
    ...human("one", { sex: "female" }),
    partners: [{ ...human("two", { sex: "female" }), divorced: false }],
  };
  assert.deepEqual(
    projectFamilyDocument(familyDocumentFromTree(couple)),
    couple,
  );
});

test("partnership order is preserved while birth dates determine sibling order", () => {
  const stored = document();
  stored.partnerships.reverse();
  stored.partnerships.find(({ id }) => id === "u1").childIds.reverse();
  const expected = structuredClone(tree);
  expected.partners.reverse();
  assert.deepEqual(projectFamilyDocument(stored), expected);
});

/** @type {{name: string, children: [string, string?][], expected: string[]}[]} */
const siblingOrderCases = [
  {
    name: "full dates compare year, month and day",
    children: [
      ["latest", "2001-01-01"],
      ["latermonth", "2000-12-01"],
      ["laterday", "2000-02-20"],
      ["earlierday", "2000-02-01"],
      ["earliest", "1999-12-31"],
    ],
    expected: ["earliest", "earlierday", "laterday", "latermonth", "latest"],
  },
  {
    name: "partial dates sort at the start of their year or month",
    children: [
      ["februaryday", "2000-02-01"],
      ["januaryday", "2000-01-01"],
      ["yearonly", "2000"],
      ["februaryonly", "2000-02"],
      ["januaryonly", "2000-01"],
    ],
    expected: [
      "yearonly",
      "januaryonly",
      "januaryday",
      "februaryonly",
      "februaryday",
    ],
  },
  {
    name: "equal dates stay stable and undated siblings come last",
    children: [
      ["unknownz"],
      ["twinz", "2000-02-01"],
      ["unknowna"],
      ["twina", "2000-02-01"],
      ["older", "1999"],
    ],
    expected: ["older", "twinz", "twina", "unknownz", "unknowna"],
  },
];

for (const { name, children, expected } of siblingOrderCases) {
  test(`sibling ordering: ${name}`, () => {
    const source = {
      ...human("parent"),
      partners: [
        {
          ...human("partner"),
          children: children.map(([id, date]) =>
            human(id, {
              name: id,
              ...(date === undefined ? {} : { birthdate: birthDate(date) }),
            }),
          ),
        },
      ],
    };
    const stored = familyDocumentFromTree(source);
    const before = structuredClone(stored);
    const projected = projectFamilyDocument(freeze(stored));
    assert.deepEqual(
      projected.partners[0].children.map(({ id }) => id),
      expected,
    );
    assert.deepEqual(
      projected.partners[0].children.map(({ id, birthdate }) => [
        id,
        birthdate,
      ]),
      expected.map((id) => [
        id,
        children.find(([childId]) => childId === id)?.[1],
      ]),
    );
    assert.deepEqual(stored, before);
  });
}

test("siblings are ordered independently in each partnership and generation", () => {
  const source = structuredClone(tree);
  source.partners[0].children[1].birthdate = birthDate("1960");
  source.partners[0].children[0].partners[0].children = [
    human("younggrandchild", { birthdate: birthDate("2000") }),
    human("oldgrandchild", { birthdate: birthDate("1990") }),
  ];
  source.partners[1].children = [
    human("otherchild", { birthdate: birthDate("1962") }),
    human("otherolderchild", { birthdate: birthDate("1959") }),
  ];
  const stored = familyDocumentFromTree(source);
  const projected = projectFamilyDocument(stored);
  assert.deepEqual(
    projected.partners[0].children.map(({ id }) => id),
    ["flo", "cam"],
  );
  assert.deepEqual(
    projected.partners[0].children[1].partners[0].children.map(({ id }) => id),
    ["oldgrandchild", "younggrandchild"],
  );
  assert.deepEqual(
    projected.partners[1].children.map(({ id }) => id),
    ["otherolderchild", "otherchild"],
  );
});

test("parsing, converting and projecting do not mutate or share mutable records", () => {
  const source = freeze(structuredClone(tree));
  const sourceBefore = structuredClone(source);
  const stored = familyDocumentFromTree(source);
  const before = structuredClone(stored);
  const parsed = parseFamilyDocument(freeze(stored));
  parsed.people[0].name = "Changed parsed name";
  parsed.partnerships[0].childIds.reverse();
  const projected = projectFamilyDocument(stored);
  projected.name = "Changed display name";
  projected.partners[0].children.reverse();
  projected.partners[0].children[0].name = "Changed child name";
  assert.deepEqual(stored, before);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(projectFamilyDocument(stored), tree);
});

test("legacy conversion discards search annotations and canonicalizes empty lists", () => {
  const annotated = {
    ...human("one"),
    match: true,
    searchHighlights: {
      name: [{ start: 0, end: 1 }],
      surname: [],
      marriedSurname: [],
    },
    partners: [{ ...human("two"), match: false, children: [] }],
  };
  const stored = familyDocumentFromTree(annotated);
  assert.deepEqual(stored.people, [human("one"), human("two")]);
  assert.deepEqual(projectFamilyDocument(stored), {
    ...human("one"),
    partners: [{ ...human("two"), divorced: false }],
  });
  assert.deepEqual(
    projectFamilyDocument(
      familyDocumentFromTree({ ...human("leaf"), partners: [] }),
    ),
    human("leaf"),
  );
});

for (const [label, edit, path] of [
  ["future schema version", (d) => (d.schemaVersion = 2), ["schemaVersion"]],
  ["fractional revision", (d) => (d.revision = 1.5), ["revision"]],
  [
    "unsafe revision",
    (d) => (d.revision = Number.MAX_SAFE_INTEGER + 1),
    ["revision"],
  ],
  ["negative revision", (d) => (d.revision = -1), ["revision"]],
  ["blank title", (d) => (d.title = " \t"), ["title"]],
  ["unsafe ID", (d) => (d.people[0].id = "not an id"), ["people", 0, "id"]],
  [
    "invalid date",
    (d) => (d.people[0].birthdate = "2001-02-29"),
    ["people", 0, "birthdate"],
  ],
  [
    "timestamp",
    (d) => (d.people[0].birthdate = new Date()),
    ["people", 0, "birthdate"],
  ],
  ["view annotation", (d) => (d.people[0].match = true), ["people", 0]],
  ["unknown document field", (d) => (d.schemaVerison = 1), []],
  ["duplicate person", (d) => d.people.push(d.people[0]), ["people", 8, "id"]],
  ["missing root", (d) => (d.rootPersonId = "missing"), ["rootPersonId"]],
  [
    "missing partner",
    (d) => (d.partnerships[0].personIds[1] = "missing"),
    ["partnerships", 0, "personIds", 1],
  ],
  [
    "missing child",
    (d) => (d.partnerships[0].childIds[0] = "missing"),
    ["partnerships", 0, "childIds", 0],
  ],
  [
    "duplicate child",
    (d) => d.partnerships[0].childIds.push("cam"),
    ["partnerships", 0, "childIds", 2],
  ],
  [
    "self partnership",
    (d) => (d.partnerships[0].personIds[1] = "alex"),
    ["partnerships", 0, "personIds"],
  ],
  [
    "self parent",
    (d) => d.partnerships[0].childIds.push("alex"),
    ["partnerships", 0, "childIds", 2],
  ],
  [
    "duplicate partnership ID",
    (d) => (d.partnerships[1].id = d.partnerships[0].id),
    ["partnerships", 1, "id"],
  ],
  [
    "repeated pair in reverse order",
    (d) =>
      d.partnerships.push({
        id: "again",
        personIds: ["bea", "alex"],
        childIds: [],
      }),
    ["partnerships", 3, "personIds"],
  ],
  [
    "two parental partnerships",
    (d) => d.partnerships[1].childIds.push("cam"),
    ["partnerships", 1, "childIds", 1],
  ],
]) {
  test(`document validation rejects ${label}`, () => {
    const stored = document();
    edit(stored);
    assertInvalid(stored, path);
  });
}

test("ancestry cycles are rejected even outside the selected view", () => {
  const stored = document();
  stored.people.push(
    human("outsidea"),
    human("outsideb"),
    human("outsidec"),
    human("outsided"),
  );
  stored.partnerships.push(
    {
      id: "cyclea",
      personIds: ["outsidea", "outsideb"],
      childIds: ["outsidec"],
    },
    {
      id: "cycleb",
      personIds: ["outsidec", "outsided"],
      childIds: ["outsidea"],
    },
  );
  assertInvalid(stored, ["partnerships"], "ancestry cycle");
});

test("an unsupported root fails without dropping a displayed partner's other family", () => {
  assert.throws(
    () => projectFamilyDocument(document(), "bea"),
    (error) =>
      error instanceof FamilyProjectionError &&
      error.code === "PARTNER_BRANCHES",
  );
  assert.throws(
    () => projectFamilyDocument(document(), "missing"),
    (error) =>
      error instanceof FamilyProjectionError && error.code === "UNKNOWN_ROOT",
  );
});

test("repeated visible people fail rather than generating duplicate card IDs", () => {
  const stored = document();
  stored.partnerships.push({
    id: "siblings",
    personIds: ["cam", "flo"],
    childIds: [],
  });
  assert.doesNotThrow(() => parseFamilyDocument(stored));
  assert.throws(
    () => projectFamilyDocument(stored),
    (error) =>
      error instanceof FamilyProjectionError &&
      error.code === "REPEATED_PERSON",
  );
});

test("documents retain three partnerships while the current desktop view rejects them", () => {
  const stored = document();
  stored.people.push(human("third"));
  stored.partnerships.push({
    id: "thirdunion",
    personIds: ["alex", "third"],
    childIds: [],
  });
  assert.doesNotThrow(() => parseFamilyDocument(stored));
  assert.throws(
    () => projectFamilyDocument(stored),
    (error) =>
      error instanceof FamilyProjectionError &&
      error.code === "TOO_MANY_PARTNERSHIPS",
  );
});

test("legacy conversion rejects duplicate identities and cyclic source objects", () => {
  const repeated = { ...human("a"), partners: [human("a")] };
  assert.throws(
    () => familyDocumentFromTree(repeated),
    /Duplicate source person ID/,
  );
  const cyclic = { ...human("a"), partners: [{ ...human("b"), children: [] }] };
  cyclic.partners[0].children.push(cyclic);
  assert.throws(
    () => familyDocumentFromTree(cyclic),
    /Duplicate source person ID/,
  );
});

test("validation and projection handle a deep family without recursive traversal", () => {
  const generations = 2500;
  const stored = {
    schemaVersion: 1,
    revision: 0,
    title: "Deep example",
    rootPersonId: "p0",
    people: [human("p0")],
    partnerships: [],
  };
  for (let index = 0; index < generations; index++) {
    stored.people.push(human(`s${index}`), human(`p${index + 1}`));
    stored.partnerships.push({
      id: `u${index}`,
      personIds: [`p${index}`, `s${index}`],
      childIds: [`p${index + 1}`],
    });
  }
  let projected = projectFamilyDocument(stored);
  let depth = 0;
  while (projected.partners?.[0]?.children?.[0]) {
    depth++;
    projected = projected.partners[0].children[0];
  }
  assert.equal(depth, generations);
});
