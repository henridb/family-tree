import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { scryptSync } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";

import { configureAuth } from "../scripts/auth-configuration.mjs";
import {
  configurationValues,
  prepareLoginDatabase,
  setupProject,
} from "../scripts/setup-project.mjs";
import { createFileFamilyStore } from "../src/server/family-store-file.ts";
import { exampleFamily } from "./helpers/family-store-fixtures.mjs";

/** @typedef {import('../scripts/setup-project.mjs').SetupOptions} SetupOptions */
/** @typedef {import('../scripts/setup-project.mjs').PromptOptions} PromptOptions */
/**
 * @typedef {SetupOptions & {
 *   messages: string[],
 *   questions: (PromptOptions & {question: string})[]
 * }} SetupFixtureOptions
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const viewer = "Viewer fixture $word ' \" é";
const owner = "Owner fixture password";
const secret = "A disposable setup test session secret";

/**
 * Create a disposable checkout configuration and remove only this test's verified temporary directory.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<string>} Absolute temporary checkout path.
 */
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "family-setup-test-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("family-setup-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  await writeFile(
    path.join(directory, ".env.example"),
    await readFile(path.join(root, ".env.example")),
  );
  return directory;
}

/**
 * Build guided answers and capture safe status output while keeping tests isolated from the host environment.
 * @param {string} directory
 * @param {string[]} [answers=[]] Answers consumed in prompt order.
 * @param {Partial<SetupOptions>} [overrides={}] Inject fixture callbacks or environment settings.
 * @returns {SetupFixtureOptions}
 */
function options(directory, answers = [], overrides = {}) {
  const pending = [...answers];
  const messages = [];
  const questions = [];
  return {
    directory,
    variables: {},
    messages,
    questions,
    /** @type {import('../scripts/setup-project.mjs').PrepareDatabase} */
    prepareDatabase: async () => {},
    /** @type {import('../scripts/setup-project.mjs').Report} */
    info: (message) => messages.push(message),
    /** @type {import('../scripts/setup-project.mjs').Ask} */
    ask: async (question, settings = {}) => {
      questions.push({ question, ...settings });
      assert.ok(pending.length, `Unexpected question: ${question}`);
      return pending.shift();
    },
    ...overrides,
  };
}

/**
 * Derive a fixture hash independently to verify the generated credentials.
 * @param {string} password
 * @param {string} stored A complete scrypt hash including its salt.
 * @returns {boolean}
 */
function matches(password, stored) {
  const [, salt, hash] = stored.split(":");
  return (
    scryptSync(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex") === hash
  );
}

/**
 * Create existing viewing/owner configuration with a stable session secret for preservation checks.
 * @param {boolean} [ownerEnabled=true]
 * @returns {string} Dotenv contents with disposable credentials.
 */
function existing(ownerEnabled = true) {
  let text = configureAuth(`DATABASE_URL="file:./db.sqlite"\n`, viewer);
  if (ownerEnabled) text = configureAuth(text, owner, { owner: true });
  return text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`);
}

test("fresh setup creates usable local storage and reruns preserve credentials, family history and login attempts", async (t) => {
  const directory = await fixture(t);
  const initial = options(
    directory,
    ["1", "Fictional family", viewer, viewer, owner, owner],
    { prepareDatabase: prepareLoginDatabase },
  );
  const result = await setupProject(initial);
  assert.equal(result.familyCreated, true);
  assert.equal(result.loginStore, "sqlite");
  const config = await readFile(path.join(directory, ".env"), "utf8");
  const values = configurationValues(config);
  assert.ok(matches(viewer, values.PASSWORD_HASH));
  assert.ok(matches(owner, values.OWNER_PASSWORD_HASH));
  assert.equal(JSON.parse(values.PASSWORD_RECOVERY), viewer);
  assert.equal(JSON.parse(values.OWNER_PASSWORD_RECOVERY), owner);
  assert.ok(values.SESSION_SECRET.length >= 32);
  assert.equal(initial.questions.filter((q) => q.secret).length, 4);
  assert.ok(!initial.messages.join("\n").includes(viewer));
  assert.ok(!initial.messages.join("\n").includes(owner));

  const store = createFileFamilyStore(result.familyFile);
  const document = await store.read();
  assert.equal(document.title, "Fictional family");
  assert.deepEqual(document.people, []);
  assert.equal(document.rootPersonId, null);
  await store.save({ ...document, title: "Entered later" }, 0);
  const familyBefore = await readFile(result.familyFile, "utf8");
  const client = new PrismaClient({
    datasources: {
      db: {
        url: `file:${path.join(directory, "prisma/db.sqlite").replaceAll("\\", "/")}`,
      },
    },
  });
  try {
    await client.$executeRaw`INSERT INTO "LoginRateLimit" ("id", "attempts", "windowStart") VALUES ('family-login', 7, 123)`;
    await client.$executeRaw`CREATE TABLE "Unrelated" ("value" TEXT)`;
    await client.$executeRaw`INSERT INTO "Unrelated" VALUES ('keep me')`;
    const rerun = await setupProject(
      options(directory, [], { prepareDatabase: prepareLoginDatabase }),
    );
    assert.equal(rerun.configurationChanged, false);
    assert.equal(rerun.familyCreated, false);
    assert.equal(await readFile(path.join(directory, ".env"), "utf8"), config);
    assert.equal(await readFile(result.familyFile, "utf8"), familyBefore);
    assert.equal(
      (
        await client.loginRateLimit.findUnique({
          where: { id: "family-login" },
        })
      ).attempts,
      7,
    );
    assert.deepEqual(await client.$queryRaw`SELECT "value" FROM "Unrelated"`, [
      { value: "keep me" },
    ]);
  } finally {
    await client.$disconnect();
  }
});

for (const format of ["document", "tree"]) {
  test(`setup detects a ${format} import, preserves source identities and initializes its own revision`, async (t) => {
    const directory = await fixture(t);
    const input =
      format === "document"
        ? { ...exampleFamily(), revision: 42 }
        : { ...exampleFamily().people[0] };
    const text = JSON.stringify(input);
    await writeFile(path.join(directory, "source file.json"), text);
    const result = await setupProject(
      options(directory, [
        "2",
        "Nested title",
        '"source file.json"',
        viewer,
        viewer,
        owner,
        owner,
      ]),
    );
    const document = await createFileFamilyStore(result.familyFile).read();
    assert.equal(document.revision, 0);
    assert.equal(document.rootPersonId, "alex");
    assert.equal(document.people.length, format === "document" ? 4 : 1);
    assert.equal(
      document.title,
      format === "document" ? input.title : "Nested title",
    );
    assert.equal(
      await readFile(path.join(directory, "source file.json"), "utf8"),
      text,
    );
  });
}

test("adding owner access backs up existing configuration without rotating viewing credentials or rewriting the family", async (t) => {
  const directory = await fixture(t);
  const config = existing(false);
  await writeFile(path.join(directory, ".env"), config);
  await mkdir(path.join(directory, ".data"));
  const data = JSON.stringify(exampleFamily());
  await writeFile(path.join(directory, ".data/family.json"), data);
  const args = options(directory, [
    viewer,
    viewer,
    "short",
    "short",
    owner,
    "different confirmation",
    owner,
    owner,
  ]);
  await setupProject(args);
  const before = configurationValues(config);
  const after = configurationValues(
    await readFile(path.join(directory, ".env"), "utf8"),
  );
  for (const key of ["PASSWORD_HASH", "PASSWORD_RECOVERY", "SESSION_SECRET"])
    assert.equal(after[key], before[key]);
  assert.ok(matches(owner, after.OWNER_PASSWORD_HASH));
  assert.equal(
    await readFile(path.join(directory, ".data/family.json"), "utf8"),
    data,
  );
  const backups = await readdir(path.join(directory, ".data/backups"));
  assert.equal(backups.length, 1);
  assert.equal(
    await readFile(
      path.join(directory, ".data/backups", backups[0], ".env"),
      "utf8",
    ),
    config,
  );
  assert.ok(
    args.messages.includes(
      "The owner password must differ from the shared viewing password.",
    ),
  );
});

test("malformed imports and unsupported views can be corrected before any configuration or family is saved", async (t) => {
  const directory = await fixture(t);
  await writeFile(
    path.join(directory, "bad.json"),
    '{"secret-name":"not a family"}',
  );
  const incompatible = exampleFamily();
  incompatible.people.push({
    id: "other",
    name: "Other",
    surname: "Person",
    sex: "male",
  });
  incompatible.partnerships.push({
    id: "otherunion",
    personIds: ["bea", "other"],
    childIds: [],
  });
  await writeFile(
    path.join(directory, "unsupported.json"),
    JSON.stringify(incompatible),
  );
  let prepared = false;
  const args = options(
    directory,
    ["2", "Test", "bad.json", "2", "Test", "unsupported.json"],
    {
      /** @type {import('../scripts/setup-project.mjs').PrepareDatabase} */
      prepareDatabase: async () => {
        prepared = true;
      },
    },
  );
  await assert.rejects(setupProject(args), /Unexpected question/);
  assert.equal(prepared, false);
  await assert.rejects(access(path.join(directory, ".env")));
  await assert.rejects(access(path.join(directory, ".data/family.json")));
  await assert.rejects(access(path.join(directory, ".data/setup.lock")));
  assert.ok(!args.messages.join("\n").includes("secret-name"));
});

for (const quoted of [false, true]) {
  test(`setup imports an absolute path with spaces${quoted ? " in quotes" : ""}`, async (t) => {
    const directory = await fixture(t);
    const file = path.join(directory, "source folder", "family.json");
    await mkdir(path.dirname(file));
    await writeFile(file, JSON.stringify(exampleFamily()));
    assert.ok(path.isAbsolute(file));
    const input = quoted ? `"${file}"` : file;
    const result = await setupProject(
      options(directory, ["2", "Test", input, viewer, viewer, owner, owner]),
    );
    assert.equal(
      (await createFileFamilyStore(result.familyFile).read()).people.length,
      4,
    );
  });
}

for (const [label, text, diagnostic] of [
  ["unreadable path", null, /file could not be read/i],
  [
    "TypeScript module",
    'export const family = { name: "private fixture value" };',
    /not valid JSON.*TypeScript/,
  ],
  [
    "invalid family field",
    JSON.stringify({
      id: "test",
      name: "private fixture value",
      surname: "Test",
      sex: "male",
      birthdate: "bad-private-date",
    }),
    /invalid at birthdate/,
  ],
  [
    "duplicate identities",
    JSON.stringify({
      id: "same",
      name: "private fixture value",
      surname: "Test",
      sex: "male",
      partners: [{ id: "same", name: "Other", surname: "Test", sex: "female" }],
    }),
    /repeats a person ID/,
  ],
]) {
  test(`setup distinguishes ${label} without exposing source contents or replacing data`, async (t) => {
    const directory = await fixture(t);
    const file = path.join(directory, "input.ts");
    if (text !== null) await writeFile(file, text);
    const args = options(directory, ["2", "Test", file]);
    await assert.rejects(setupProject(args), /Unexpected question/);
    assert.ok(args.messages.some((message) => diagnostic.test(message)));
    assert.ok(!args.messages.join("\n").includes("private fixture value"));
    assert.ok(!args.messages.join("\n").includes("bad-private-date"));
    await assert.rejects(access(path.join(directory, ".env")));
    await assert.rejects(access(path.join(directory, ".data/family.json")));
    if (text !== null) assert.equal(await readFile(file, "utf8"), text);
  });
}

for (const [label, config] of [
  ["malformed hash", 'PASSWORD_HASH="invalid-private-value"\n'],
  ["short existing session secret", 'SESSION_SECRET="short-private-value"\n'],
  ["partial Redis credentials", 'KV_REST_API_TOKEN="private-token"\n'],
  ["invalid database URL", 'DATABASE_URL="invalid-private-value"\n'],
  ["unsafe new family destination", 'FAMILY_DATA_FILE="public/family.json"\n'],
]) {
  test(`setup rejects ${label} without replacing configuration`, async (t) => {
    const directory = await fixture(t);
    await writeFile(path.join(directory, ".env"), config);
    await assert.rejects(setupProject(options(directory)));
    assert.equal(await readFile(path.join(directory, ".env"), "utf8"), config);
    await assert.rejects(access(path.join(directory, ".data/family.json")));
  });
}

test("higher priority environment settings are detected without printing their values", async (t) => {
  const directory = await fixture(t);
  await writeFile(
    path.join(directory, ".env.local"),
    'SESSION_SECRET="private-override"\n',
  );
  await assert.rejects(
    setupProject(options(directory)),
    (error) =>
      error.message.includes(".env.local") &&
      !error.message.includes("private-override"),
  );
  await rm(path.join(directory, ".env.local"));
  await assert.rejects(
    setupProject(
      options(directory, [], {
        variables: { DATABASE_URL: "private-override" },
      }),
    ),
    (error) => !error.message.includes("private-override"),
  );
  await assert.rejects(access(path.join(directory, ".env")));
});

test("dotenv references resolve as in Next.js and existing Redis configuration never contacts a hosted store", async (t) => {
  const directory = await fixture(t);
  const config =
    existing() +
    '\nLOGIN_TOKEN="test-only-token"\nKV_REST_API_URL="https://example.invalid"\nKV_REST_API_TOKEN="$LOGIN_TOKEN"\n';
  await writeFile(path.join(directory, ".env"), config);
  await mkdir(path.join(directory, ".data"));
  await writeFile(
    path.join(directory, ".data/family.json"),
    JSON.stringify(exampleFamily()),
  );
  const args = options(directory, [], {
    /** @type {import('../scripts/setup-project.mjs').PrepareDatabase} */
    prepareDatabase: async () =>
      assert.fail("Redis setup must not initialize SQLite"),
  });
  const result = await setupProject(args);
  assert.equal(result.loginStore, "redis");
  assert.equal(result.configurationChanged, false);
  assert.equal(
    configurationValues(config).KV_REST_API_TOKEN,
    "test-only-token",
  );
});

test("existing invalid family data and another setup's lock are preserved", async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, ".data"));
  const file = path.join(directory, ".data/family.json");
  await writeFile(file, "{broken-private-data");
  await assert.rejects(
    setupProject(options(directory)),
    /Existing family data/,
  );
  assert.equal(await readFile(file, "utf8"), "{broken-private-data");
  await writeFile(path.join(directory, ".data/setup.lock"), "another setup");
  await assert.rejects(setupProject(options(directory)), /Another setup/);
  assert.equal(
    await readFile(path.join(directory, ".data/setup.lock"), "utf8"),
    "another setup",
  );
});

test("a concurrent family initialization wins without being overwritten by setup", async (t) => {
  const directory = await fixture(t);
  const data = JSON.stringify(exampleFamily("Concurrent family"));
  const args = options(
    directory,
    ["1", "New family", viewer, viewer, owner, owner],
    {
      /** @type {import('../scripts/setup-project.mjs').PrepareDatabase} */
      prepareDatabase: async () =>
        writeFile(path.join(directory, ".data/family.json"), data),
    },
  );
  await assert.rejects(setupProject(args), /family changed/i);
  assert.equal(
    await readFile(path.join(directory, ".data/family.json"), "utf8"),
    data,
  );
  const saved = await readFile(path.join(directory, ".env"), "utf8");
  await setupProject(options(directory));
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), saved);
});

test("concurrent configuration changes are not replaced", async (t) => {
  const directory = await fixture(t);
  const config = existing();
  await writeFile(path.join(directory, ".env"), config);
  const changed = `${config}\n# changed in another editor\n`;
  const args = options(directory, ["1", "Test"], {
    /** @type {import('../scripts/setup-project.mjs').PrepareDatabase} */
    prepareDatabase: async () =>
      writeFile(path.join(directory, ".env"), changed),
  });
  // Force a legitimate missing setting so setup needs to save its planned changes.
  await writeFile(
    path.join(directory, ".env"),
    config.replace(/^SESSION_SECRET=.*$/m, 'SESSION_SECRET=""'),
  );
  await assert.rejects(setupProject(args), /changed during setup/);
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), changed);
  await assert.rejects(access(path.join(directory, ".data/family.json")));
});

test("private setup directories cannot redirect family or secret backups through symlinks", async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, "public"));
  await symlink(
    path.join(directory, "public"),
    path.join(directory, ".data"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(setupProject(options(directory)), /symlink/);
  assert.deepEqual(await readdir(path.join(directory, "public")), []);
  await rm(path.join(directory, ".data"));
});

test("CLI refuses noninteractive or argument-based password input without revealing arguments", async (t) => {
  const directory = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--conditions=react-server",
      path.join(root, "scripts/setup.mjs"),
      "private-argument",
    ],
    { cwd: directory, encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
  assert.ok(!result.stderr.includes("private-argument"));
  await assert.rejects(access(path.join(directory, ".env")));
});

test("importing setup does not load application dotenv values before shell-override checks", async (t) => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, ".env"), existing());
  const script = `
    const keys = ['PASSWORD_HASH', 'OWNER_PASSWORD_HASH', 'SESSION_SECRET', 'DATABASE_URL'];
    const before = keys.map(key => process.env[key] !== undefined);
    await import(process.argv[1]);
    if (keys.some((key, index) => (process.env[key] !== undefined) !== before[index])) {
      console.error('Setup import loaded application settings prematurely');
      process.exitCode = 1;
    }
  `;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--conditions=react-server",
      "--input-type=module",
      "-e",
      script,
      new URL("../scripts/setup-project.mjs", import.meta.url).href,
    ],
    {
      cwd: directory,
      env: { NODE_ENV: "development", SystemRoot: process.env.SystemRoot },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("an uneditable password-hash reference stops instead of asking for passwords indefinitely", async (t) => {
  const directory = await fixture(t);
  const base = existing(false);
  const values = configurationValues(base);
  const config =
    base.replace(/^PASSWORD_HASH=.*$/m, 'PASSWORD_HASH="$VIEWER_HASH"') +
    `\nVIEWER_HASH="${values.PASSWORD_HASH}"\n`;
  await writeFile(path.join(directory, ".env"), config);
  await assert.rejects(
    setupProject(options(directory, ["1", "Test", owner, owner])),
    /stored directly in .env/,
  );
  assert.equal(await readFile(path.join(directory, ".env"), "utf8"), config);
});

test("an incompatible existing login table is reported without resetting its rows", async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, "prisma"));
  const client = new PrismaClient({
    datasources: {
      db: {
        url: `file:${path.join(directory, "prisma/db.sqlite").replaceAll("\\", "/")}`,
      },
    },
  });
  try {
    await client.$executeRaw`CREATE TABLE "LoginRateLimit" ("id" TEXT, "attempts" INTEGER NOT NULL, "windowStart" BIGINT NOT NULL)`;
    await client.$executeRaw`INSERT INTO "LoginRateLimit" VALUES ('keep', 9, 123)`;
    await assert.rejects(
      prepareLoginDatabase(directory, "file:./db.sqlite"),
      /could not be prepared/,
    );
    assert.equal(
      (await client.$queryRaw`SELECT "attempts" FROM "LoginRateLimit"`)[0]
        .attempts,
      9,
    );
  } finally {
    await client.$disconnect();
  }
});
