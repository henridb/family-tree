import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";

import { configureAuth } from "../scripts/auth-configuration.mjs";

const require = createRequire(import.meta.url);
const template = '# Keep this comment\r\nDATABASE_URL="file:./test.sqlite"\r\n';

test("configuring an owner password preserves viewing credentials, recovery, and sessions", () => {
  const existing = configureAuth(template, "Existing viewer password");
  const configured = configureAuth(existing, "Different owner password", {
    owner: true,
  });
  const before = parseEnv(existing);
  const after = parseEnv(configured);
  const [, salt, hash] = after.OWNER_PASSWORD_HASH.split(":");
  assert.equal(hashPassword("Different owner password", salt), hash);
  assert.equal(
    JSON.parse(after.OWNER_PASSWORD_RECOVERY),
    "Different owner password",
  );
  delete after.OWNER_PASSWORD_HASH;
  delete after.OWNER_PASSWORD_RECOVERY;
  assert.deepEqual(after, before);
  const changedViewer = parseEnv(
    configureAuth(configured, "New viewer password"),
  );
  assert.equal(
    changedViewer.OWNER_PASSWORD_HASH,
    parseEnv(configured).OWNER_PASSWORD_HASH,
  );
  assert.equal(
    changedViewer.OWNER_PASSWORD_RECOVERY,
    parseEnv(configured).OWNER_PASSWORD_RECOVERY,
  );
  assert.throws(
    () => configureAuth(existing, "short", { owner: true }),
    /between 6/,
  );
  assert.throws(
    () => configureAuth(existing, "Existing viewer password", { owner: true }),
    /must differ/,
  );
});

/**
 * Derive the hexadecimal scrypt hash used to verify disposable test credentials.
 * @param {string} password
 * @param {string} salt
 * @returns {string}
 */
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
}

/**
 * Load fixture dotenv text through Next.js in a fresh process and return its
 * parsed variables.
 *
 * Remove inherited authentication settings to avoid cached or ambient values
 * masking parsing failures, and delete the temporary fixture afterward.
 *
 * @param {string} configuration
 * @returns {Record<string, string>} Variables actually parsed from the temporary dotenv file.
 */
function loadWithNext(configuration) {
  const directory = mkdtempSync(path.join(tmpdir(), "family-auth-config-"));
  try {
    writeFileSync(path.join(directory, ".env"), configuration);
    const environment = { ...process.env, NODE_ENV: "production" };
    for (const key of [
      "DATABASE_URL",
      "PASSWORD_HASH",
      "PASSWORD_RECOVERY",
      "OWNER_PASSWORD_HASH",
      "OWNER_PASSWORD_RECOVERY",
      "SESSION_SECRET",
      "__NEXT_PROCESSED_ENV",
    ]) {
      delete environment[key];
    }
    // Use a fresh process so Next's environment cache cannot mask a parsing error.
    const script = `
      const { loadEnvConfig } = require(${JSON.stringify(require.resolve("@next/env"))});
      const { parsedEnv } = loadEnvConfig(process.cwd());
      process.stdout.write(JSON.stringify(parsedEnv));
    `;
    return JSON.parse(
      execFileSync(process.execPath, ["-e", script], {
        cwd: directory,
        env: environment,
        encoding: "utf8",
        windowsHide: true,
      }),
    );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("family-auth-config-"));
    rmSync(directory, { recursive: true, force: true });
  }
}

const specialCharacters = [
  "  ",
  "'",
  '"',
  "`",
  "$HOME",
  "${SESSION_SECRET}",
  "\\n",
  "\\r",
  "\\",
  "#",
  "$&",
  "$`",
  "$'",
  "\u2028",
  "\u2029",
  "é",
  "  ",
].join("");

test("owner recovery preserves special characters through Next.js environment loading", () => {
  const viewing = configureAuth(template, "Viewing password");
  const configuration = configureAuth(viewing, specialCharacters, {
    owner: true,
  });
  const loaded = loadWithNext(configuration);
  assert.equal(JSON.parse(loaded.OWNER_PASSWORD_RECOVERY), specialCharacters);
  const [, salt, expected] = loaded.OWNER_PASSWORD_HASH.split(":");
  assert.equal(hashPassword(specialCharacters, salt), expected);
  assert.equal(loaded.PASSWORD_RECOVERY, parseEnv(viewing).PASSWORD_RECOVERY);
});

test("saving an existing owner password replaces only its recovery metadata", () => {
  const existing = `${configureAuth(configureAuth(template, "Viewing password"), specialCharacters, { owner: true })}export OWNER_PASSWORD_RECOVERY = '\"stale owner copy\"'\r\n`;
  const configuration = configureAuth(existing, specialCharacters, {
    owner: true,
    saveExisting: true,
  });
  const before = parseEnv(existing);
  const after = loadWithNext(configuration);
  assert.equal(JSON.parse(after.OWNER_PASSWORD_RECOVERY), specialCharacters);
  assert.ok(!configuration.includes("stale owner copy"));
  delete before.OWNER_PASSWORD_RECOVERY;
  delete after.OWNER_PASSWORD_RECOVERY;
  assert.deepEqual(after, before);
});

test("owner recovery rejects an incorrect password and missing or malformed owner hashes", () => {
  const existing = configureAuth(
    configureAuth(template, "Viewing password"),
    "Current owner password",
    { owner: true },
  );
  assert.throws(
    () =>
      configureAuth(existing, "Incorrect owner password", {
        owner: true,
        saveExisting: true,
      }),
    /does not match/,
  );
  for (const configuration of [
    template,
    `${template}OWNER_PASSWORD_HASH="invalid"\n`,
  ])
    assert.throws(
      () =>
        configureAuth(configuration, "Current owner password", {
          owner: true,
          saveExisting: true,
        }),
      /valid OWNER_PASSWORD_HASH/,
    );
});

for (const [name, password] of [
  ["six-character password", "six123"],
  [
    "quotes, expansion syntax, backslashes, Unicode, and surrounding spaces",
    specialCharacters,
  ],
  ["maximum-length password", "x".repeat(1024)],
]) {
  test(`new configuration preserves a ${name} through Next.js loading`, () => {
    const configuration = configureAuth(template, password);
    const loaded = loadWithNext(configuration);
    assert.equal(JSON.parse(loaded.PASSWORD_RECOVERY), password);
    const [, salt, expected] = loaded.PASSWORD_HASH.split(":");
    assert.equal(hashPassword(password, salt), expected);
    assert.match(loaded.SESSION_SECRET, /^[a-f0-9]{64}$/);
    assert.ok(configuration.startsWith(template));
  });
}

test("new passwords must be between six and 1024 characters", () => {
  for (const password of ["short", "x".repeat(1025)]) {
    assert.throws(
      () => configureAuth(template, password),
      /between 6 and 1024/,
    );
  }
});

test("saving an existing password adds only recovery metadata and preserves session credentials", () => {
  const password = "Current password";
  const existing = configureAuth(template, password).replace(
    /^PASSWORD_RECOVERY=.*\r?\n/gm,
    "",
  );
  const configuration = configureAuth(existing, password, {
    saveExisting: true,
  });
  const before = parseEnv(existing);
  const after = loadWithNext(configuration);
  assert.ok(configuration.startsWith(existing));
  assert.equal(after.PASSWORD_HASH, before.PASSWORD_HASH);
  assert.equal(after.SESSION_SECRET, before.SESSION_SECRET);
  assert.equal(JSON.parse(after.PASSWORD_RECOVERY), password);
});

test("saving an existing password rejects a mismatch or missing/malformed hash", () => {
  const existing = configureAuth(template, "Current password");
  assert.throws(
    () =>
      configureAuth(existing, "Incorrect password", {
        saveExisting: true,
      }),
    /does not match/,
  );
  for (const configuration of [
    template,
    `${template}PASSWORD_HASH="invalid"\n`,
  ]) {
    assert.throws(
      () =>
        configureAuth(configuration, "Current password", {
          saveExisting: true,
        }),
      /valid PASSWORD_HASH/,
    );
  }
});

test("recovery updates replace existing entries, including duplicate exported definitions", () => {
  const existing = `${configureAuth(template, "Old password")}export PASSWORD_RECOVERY = '"stale copy"'\r\n`;
  const configuration = configureAuth(existing, specialCharacters);
  const loaded = loadWithNext(configuration);
  assert.equal(JSON.parse(loaded.PASSWORD_RECOVERY), specialCharacters);
  assert.ok(!configuration.includes("stale copy"));
  assert.notEqual(loaded.SESSION_SECRET, parseEnv(existing).SESSION_SECRET);
  const [, salt, expected] = loaded.PASSWORD_HASH.split(":");
  assert.equal(hashPassword(specialCharacters, salt), expected);
});

for (const owner of [false, true])
  test(`saving an existing ${owner ? "owner " : ""}password accepts a legacy password below the new-password minimum`, () => {
    const password = "older";
    const salt = randomBytes(16).toString("hex");
    const prefix = owner ? "OWNER_PASSWORD" : "PASSWORD";
    const existing = `${template}${prefix}_HASH="scrypt:${salt}:${hashPassword(password, salt)}"\r\nSESSION_SECRET="${randomBytes(32).toString("hex")}"\r\n`;
    const configuration = configureAuth(existing, password, {
      owner,
      saveExisting: true,
    });
    assert.ok(configuration.startsWith(existing));
    assert.equal(
      JSON.parse(parseEnv(configuration)[`${prefix}_RECOVERY`]),
      password,
    );
  });
