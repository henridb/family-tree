import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { exportFamilyJson, importFamilyJson } from "../src/lib/family-json.ts";
import { projectFamilyDocument } from "../src/lib/family-projection.ts";
import {
  createRedisFamilyStore,
  familyStorageKey,
} from "../src/server/family-store-redis.ts";
import {
  FamilyStoreConflictError,
  FamilyStoreError,
} from "../src/server/family-store.ts";

let stage = "arguments";
try {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      format: { type: "string", default: "document" },
      title: { type: "string" },
      environment: { type: "string" },
      instance: { type: "string" },
      write: { type: "boolean", default: false },
    },
  });
  if (!values.input || !values.environment || !values.instance)
    throw new Error("Required arguments missing");
  const scope = {
    environment: values.environment,
    instanceId: values.instance,
  };
  const key = familyStorageKey(scope);

  stage = "input validation";
  const input = await readFile(values.input, "utf8");
  const document = importFamilyJson(input, {
    format: values.format,
    title: values.title,
  });
  document.revision = 0;
  const tree = projectFamilyDocument(document);

  stage = "private backup";
  const directory = path.resolve(".data", "backups", randomUUID());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, "input.json"), input, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    path.join(directory, "family.json"),
    exportFamilyJson(document),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    `Validated ${document.people.length} people and ${document.partnerships.length} partnerships.`,
  );
  console.log(`Private backup: ${directory}`);
  console.log(`Destination: ${key}`);
  if (values.write) {
    stage = "store initialization";
    const store = createRedisFamilyStore({
      ...scope,
      url: process.env.KV_REST_API_URL ?? "",
      token: process.env.KV_REST_API_TOKEN ?? "",
    });
    await store.save(document, null);
    stage = "read-back verification";
    const stored = await store.read();
    assert.deepEqual(stored, document);
    assert.deepEqual(projectFamilyDocument(stored), tree);
    console.log(
      "Initialized revision 0; the complete document and displayed tree match on read-back.",
    );
  } else {
    console.log(
      "Dry run complete. Add --write to initialize an empty destination; existing data cannot be overwritten.",
    );
  }
} catch (error) {
  // Never log imported records, credentials, or an assertion diff containing names.
  console.error(
    `Family initialization failed during ${stage}. No automatic retry was attempted.`,
  );
  if (error instanceof FamilyStoreConflictError)
    console.error(
      "The destination already exists. This command cannot replace it.",
    );
  else if (error instanceof FamilyStoreError)
    console.error(`Storage error: ${error.code}.`);
  console.error(
    "Usage: npm run family:initialize -- --input <file> --environment <production|preview|development> --instance <id> [--format tree] [--title <title>] [--write]",
  );
  if (stage === "store initialization" || stage === "read-back verification")
    console.error(
      "Check the destination before retrying: a save may have succeeded. Existing data is never replaced by this command.",
    );
  process.exitCode = 1;
}
