import assert from "node:assert/strict";
import { test } from "node:test";

import { parseFamilyDocument } from "../src/lib/family-document.ts";
import {
  FamilyStore,
  FamilyStoreConflictError,
  FamilyStoreError,
  familyHistoryLimit,
} from "../src/server/family-store.ts";
import {
  exampleFamily,
  memoryBackend,
} from "./helpers/family-store-fixtures.mjs";

/**
 * Build an assertion predicate matching a FamilyStoreError with the expected code.
 * @param {FamilyStoreError['code']} code
 * @returns {(error: unknown) => boolean}
 */
const isStoreError = (code) => (error) =>
  error instanceof FamilyStoreError && error.code === code;

test("an empty store stays empty until an explicit create-only save", async () => {
  const backend = memoryBackend();
  const store = new FamilyStore(backend);
  assert.equal(await store.read(), null);
  assert.deepEqual(await store.history(), []);
  await assert.rejects(store.exportJson(), isStoreError("NOT_INITIALIZED"));
  await assert.rejects(store.restore(0, 0), isStoreError("NOT_INITIALIZED"));
  await assert.rejects(
    store.save(exampleFamily(), 0),
    FamilyStoreConflictError,
  );
  assert.equal(backend.raw, null);
  const imported = exampleFamily();
  imported.revision = 123;
  const created = await store.save(imported, null);
  assert.equal(created.revision, 0);
  assert.equal(imported.revision, 123);
  await assert.rejects(
    store.save(exampleFamily("Replacement"), null),
    FamilyStoreConflictError,
  );
  assert.equal((await store.read()).title, imported.title);
});

test("saves preserve history and use the original edited revision", async () => {
  const backend = memoryBackend();
  const store = new FamilyStore(backend);
  const first = await store.save(exampleFamily(), null);
  const second = await store.save(
    { ...first, title: "Changed" },
    first.revision,
  );
  assert.equal(second.revision, 1);
  assert.deepEqual(await store.history(), [first]);
  const before = backend.raw;
  await assert.rejects(
    store.save({ ...first, title: "Stale" }, first.revision),
    FamilyStoreConflictError,
  );
  assert.equal(backend.raw, before);
  assert.deepEqual(await store.read(), second);
});

for (const initialized of [false, true]) {
  test(`concurrent ${initialized ? "edits" : "initialization"} have one winner and no partial history`, async () => {
    const backend = memoryBackend();
    const first = new FamilyStore(backend);
    const second = new FamilyStore(backend);
    if (initialized) await first.save(exampleFamily(), null);
    const expected = initialized ? 0 : null;
    const results = await Promise.allSettled([
      first.save(exampleFamily("First editor"), expected),
      second.save(exampleFamily("Second editor"), expected),
    ]);
    assert.equal(
      results.filter(({ status }) => status === "fulfilled").length,
      1,
    );
    assert.ok(
      results.find(({ status }) => status === "rejected").reason instanceof
        FamilyStoreConflictError,
    );
    const winner = results.find(({ status }) => status === "fulfilled").value;
    assert.deepEqual(await first.read(), winner);
    assert.equal((await first.history()).length, initialized ? 1 : 0);
  });
}

test("inputs are copied before asynchronous reads and outputs cannot mutate storage", async () => {
  const backend = memoryBackend();
  const originalRead = backend.read.bind(backend);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  backend.read = async () => {
    const raw = await originalRead();
    await gate;
    return raw;
  };
  const store = new FamilyStore(backend);
  const input = exampleFamily();
  const saving = store.save(input, null);
  input.people[0].name = "Changed while waiting";
  release();
  const saved = await saving;
  assert.equal(saved.people[0].name, "Alex");
  saved.people[0].name = "Changed returned value";
  const read = await store.read();
  read.partnerships[0].childIds.length = 0;
  assert.equal((await store.read()).partnerships[0].childIds.length, 1);
  assert.equal((await store.read()).people[0].name, "Alex");
  await store.save(exampleFamily("Next"), 0);
  const history = await store.history();
  history[0].people[0].name = "Changed history";
  assert.equal((await store.history())[0].people[0].name, "Alex");
});

test("invalid input fails before accessing or changing storage", async () => {
  const backend = memoryBackend();
  const store = new FamilyStore(backend);
  const invalid = exampleFamily();
  invalid.people[0].birthdate = "2001-02-29";
  await assert.rejects(store.save(invalid, null));
  await assert.rejects(store.save(exampleFamily(), -1));
  await assert.rejects(store.importJson("{", null));
  assert.equal(backend.reads, 0);
  assert.equal(backend.writes, 0);
});

test("bounded history restores as a new revision without rewinding the counter", async () => {
  const store = new FamilyStore(memoryBackend());
  let current = await store.save(exampleFamily("Original"), null);
  for (let index = 1; index <= familyHistoryLimit + 2; index++) {
    current = await store.save(
      { ...current, title: `Version ${index}` },
      current.revision,
    );
  }
  const history = await store.history();
  assert.equal(history.length, familyHistoryLimit);
  assert.deepEqual(
    history.map(({ revision }) => revision),
    Array.from(
      { length: familyHistoryLimit },
      (_, index) => current.revision - index - 1,
    ),
  );
  const selected = history[2];
  const restored = await store.restore(selected.revision, current.revision);
  assert.deepEqual(restored, { ...selected, revision: current.revision + 1 });
  assert.deepEqual((await store.history())[0], current);
  await assert.rejects(
    store.restore(0, restored.revision),
    isStoreError("REVISION_NOT_FOUND"),
  );
  await assert.rejects(
    store.restore(selected.revision, current.revision),
    FamilyStoreConflictError,
  );
  assert.deepEqual(await store.read(), restored);
});

test("JSON import/export keeps unconnected records and assigns local revisions", async () => {
  const source = exampleFamily();
  source.revision = 1000;
  const text = JSON.stringify(source);
  const store = new FamilyStore(memoryBackend());
  const first = await store.importJson(text, null);
  assert.deepEqual(first, { ...parseFamilyDocument(source), revision: 0 });
  const exported = await store.exportJson();
  assert.deepEqual(JSON.parse(exported), first);
  const second = await store.importJson(exported, 0);
  assert.equal(second.revision, 1);
  await assert.rejects(store.importJson(text, 0), FamilyStoreConflictError);
  const tree = JSON.parse(await store.exportJson({ format: "tree" }));
  assert.equal(tree.partners[0].children[0].id, "cam");
  const other = new FamilyStore(memoryBackend());
  const importedTree = await other.importJson(JSON.stringify(tree), null, {
    format: "tree",
    title: "Imported tree",
  });
  assert.equal(importedTree.people.length, 3);
  assert.equal(importedTree.title, "Imported tree");
});

test("corrupt or unsupported stored state is never overwritten by save or import", async () => {
  const valid = {
    formatVersion: 1,
    current: parseFamilyDocument(exampleFamily()),
    history: [],
  };
  for (const raw of [
    "{",
    JSON.stringify({ ...valid, formatVersion: 2 }),
    JSON.stringify({
      ...valid,
      current: { ...valid.current, schemaVersion: 2 },
    }),
    JSON.stringify({ ...valid, history: [valid.current] }),
  ]) {
    const backend = memoryBackend();
    backend.raw = raw;
    const store = new FamilyStore(backend);
    await assert.rejects(store.read(), isStoreError("INVALID_STORED_DATA"));
    await assert.rejects(
      store.save(exampleFamily(), null),
      isStoreError("INVALID_STORED_DATA"),
    );
    await assert.rejects(
      store.importJson(JSON.stringify(exampleFamily()), 0),
      isStoreError("INVALID_STORED_DATA"),
    );
    assert.equal(backend.raw, raw);
    assert.equal(backend.writes, 0);
  }
});

test("storage failures do not become an empty family or silently retry a write", async () => {
  const backend = memoryBackend();
  const store = new FamilyStore(backend);
  await store.save(exampleFamily(), null);
  const before = backend.raw;
  backend.readFailure = true;
  await assert.rejects(store.read(), isStoreError("UNAVAILABLE"));
  backend.readFailure = false;
  backend.writeFailure = true;
  await assert.rejects(
    store.save(exampleFamily("Unconfirmed"), 0),
    isStoreError("UNAVAILABLE"),
  );
  assert.equal(backend.raw, before);
  backend.writeFailure = false;
  backend.loseWriteResponse = true;
  const writes = backend.writes;
  await assert.rejects(
    store.save(exampleFamily("Committed, response lost"), 0),
    isStoreError("UNAVAILABLE"),
  );
  assert.equal(backend.writes, writes + 1);
  backend.loseWriteResponse = false;
  assert.equal((await store.read()).revision, 1);
  await assert.rejects(
    store.save(exampleFamily("Stale retry"), 0),
    FamilyStoreConflictError,
  );
  assert.equal((await store.read()).title, "Committed, response lost");
});

test("revision overflow fails before writing", async () => {
  const backend = memoryBackend();
  backend.raw = JSON.stringify({
    formatVersion: 1,
    current: {
      ...parseFamilyDocument(exampleFamily()),
      revision: Number.MAX_SAFE_INTEGER,
    },
    history: [],
  });
  await assert.rejects(
    new FamilyStore(backend).save(exampleFamily(), Number.MAX_SAFE_INTEGER),
    isStoreError("REVISION_EXHAUSTED"),
  );
  assert.equal(backend.writes, 0);
});
