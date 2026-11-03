import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createFileFamilyStore } from "../src/server/family-store-file.ts";
import { exampleFamily } from "./helpers/family-store-fixtures.mjs";

test("local saves upgrade a plain document atomically and retain recoverable revisions", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "family-file-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "family.json");
  await writeFile(file, JSON.stringify(exampleFamily()));
  const first = createFileFamilyStore(file),
    second = createFileFamilyStore(file);
  const original = await first.read();
  const results = await Promise.allSettled([
    first.save({ ...original, title: "First editor" }, 0),
    second.save({ ...original, title: "Second editor" }, 0),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.name,
    "FamilyStoreConflictError",
  );
  const snapshot = await first.snapshot();
  assert.equal(snapshot.document.revision, 1);
  assert.deepEqual(snapshot.history, [original]);
  const restored = await second.restore(0, 1);
  assert.equal(restored.revision, 2);
  assert.equal(restored.title, original.title);
  assert.equal((await first.history())[0].revision, 1);
  assert.deepEqual(await readdir(directory), ["family.json"]);
  await writeFile(file, "invalid private data");
  const before = await readFile(file, "utf8");
  await assert.rejects(first.save(original, 2), {
    code: "INVALID_STORED_DATA",
  });
  assert.equal(await readFile(file, "utf8"), before);
});

test("a competing local initialization wins once and an existing lock is never removed", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "family-file-init-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "nested/family.json");
  const store = createFileFamilyStore(file);
  assert.equal(await store.read(), null);
  const result = await Promise.allSettled([
    store.save(exampleFamily(), null),
    createFileFamilyStore(file).save(exampleFamily(), null),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const document = await store.read();
  await writeFile(file + ".lock", "owned by another writer");
  await assert.rejects(store.save(document, 0), {
    name: "FamilyStoreConflictError",
  });
  assert.equal(
    await readFile(file + ".lock", "utf8"),
    "owned by another writer",
  );
  assert.deepEqual(await store.read(), document);
});
