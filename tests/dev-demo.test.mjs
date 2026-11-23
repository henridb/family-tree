import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { scryptSync } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  demoOwnerPassword,
  demoViewerPassword,
  prepareDemo,
} from "../scripts/dev-demo.mjs";
import { parseFamilyDocument } from "../src/lib/family-document.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

/** @param {import('node:test').TestContext} t @returns {Promise<string>} Disposable checkout. */
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "family-demo-test-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("family-demo-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, "examples"));
  await writeFile(
    path.join(directory, "examples/family.json"),
    await readFile(path.join(root, "examples/family.json")),
  );
  return directory;
}

/** @param {string} password @param {string} hash @returns {boolean} Whether the password matches. */
function matches(password, hash) {
  const [, salt, expected] = hash.split(":");
  return (
    scryptSync(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex") === expected
  );
}

test("a checkout without dotenv starts from the tracked example with working isolated settings", async (t) => {
  const directory = await fixture(t);
  const result = await prepareDemo(directory, {});
  const expected = parseFamilyDocument(
    JSON.parse(
      await readFile(path.join(directory, "examples/family.json"), "utf8"),
    ),
  );
  assert.deepEqual(
    JSON.parse(await readFile(result.familyFile, "utf8")),
    expected,
  );
  assert.equal((await readdir(directory)).includes(".env"), false);
  assert.equal(result.environment.NODE_ENV, "development");
  assert.ok(matches(demoViewerPassword, result.environment.PASSWORD_HASH));
  assert.ok(matches(demoOwnerPassword, result.environment.OWNER_PASSWORD_HASH));
  assert.notEqual(demoViewerPassword, demoOwnerPassword);
  const database = new PrismaClient({
    datasources: { db: { url: result.environment.DATABASE_URL } },
  });
  try {
    assert.equal(await database.loginRateLimit.count(), 0);
  } finally {
    await database.$disconnect();
  }
  const validation = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(new URL("../src/env.js", import.meta.url).href)})`,
    ],
    { env: result.environment, windowsHide: true, encoding: "utf8" },
  );
  assert.equal(validation.status, 0, validation.stderr);
});

test("demo runs preserve existing settings, families and example files and never reuse demo edits", async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, ".data"));
  const realFamily = path.join(directory, ".data/family.json");
  const dotenv = "DATABASE_URL=invalid\nPASSWORD_HASH=invalid\n";
  await writeFile(path.join(directory, ".env"), dotenv);
  await writeFile(realFamily, "Existing family must not change");
  const example = await readFile(
    path.join(directory, "examples/family.json"),
    "utf8",
  );
  const variables = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_URL: "private.example",
    KV_REST_API_URL: "https://must-not-contact.invalid",
    KV_REST_API_TOKEN: "private-token",
    FAMILY_DATA_FILE: realFamily,
    FAMILY_INSTANCE_ID: "real",
    DATABASE_URL: "invalid",
    PASSWORD_HASH: "private",
    OWNER_PASSWORD_HASH: "private",
    SESSION_SECRET: "private",
    PASSWORD_RECOVERY: "private",
    OWNER_PASSWORD_RECOVERY: "private",
    SKIP_ENV_VALIDATION: "1",
  };
  const before = { ...variables };
  const first = await prepareDemo(directory, variables);
  await writeFile(first.familyFile, "A discarded demo edit");
  const second = await prepareDemo(directory, variables);
  assert.notEqual(first.familyFile, second.familyFile);
  assert.notEqual(
    first.environment.DATABASE_URL,
    second.environment.DATABASE_URL,
  );
  assert.notEqual(
    first.environment.SESSION_SECRET,
    second.environment.SESSION_SECRET,
  );
  assert.ok(
    path
      .dirname(first.familyFile)
      .startsWith(path.join(directory, ".data", "demo-")),
  );
  assert.equal(
    JSON.parse(await readFile(second.familyFile, "utf8")).rootPersonId,
    "alex",
  );
  assert.equal(
    await readFile(first.familyFile, "utf8"),
    "A discarded demo edit",
  );
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "PASSWORD_RECOVERY",
    "OWNER_PASSWORD_RECOVERY",
    "SKIP_ENV_VALIDATION",
  ])
    assert.equal(second.environment[key], "");
  assert.equal(
    await readFile(realFamily, "utf8"),
    "Existing family must not change",
  );
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), dotenv);
  assert.equal(
    await readFile(path.join(directory, "examples/family.json"), "utf8"),
    example,
  );
  assert.deepEqual(variables, before);
});

test("an invalid example fails before creating demo storage", async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, "examples/family.json"), "{}");
  await assert.rejects(prepareDemo(directory, {}));
  assert.deepEqual(await readdir(directory), ["examples"]);
});

test("the demo CLI refuses invalid ports and overrides of its local-only host", () => {
  const script = fileURLToPath(
    new URL("../scripts/dev-demo.mjs", import.meta.url),
  );
  for (const args of [
    ["--port", "0"],
    ["--hostname", "0.0.0.0"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--conditions=react-server",
        script,
        ...args,
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /port|hostname/);
  }
});
