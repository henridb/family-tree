import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  exampleFamily,
  redisRestFixture,
} from "./helpers/family-store-fixtures.mjs";

const script = fileURLToPath(
  new URL("../scripts/initialize-family.mjs", import.meta.url),
);
/**
 * Run the initialization CLI in an isolated directory with explicitly supplied
 * fixture credentials.
 *
 * Clear inherited Redis credentials, capture combined output and return the
 * process exit code for assertions.
 *
 * @param {string} cwd Temporary working directory.
 * @param {string[]} args CLI arguments, excluding the executable and script path.
 * @param {NodeJS.ProcessEnv} [variables={}] Fixture environment overrides.
 * @returns {Promise<{code: number | null, output: string}>} Exit code and combined stdout/stderr.
 */
async function run(cwd, args, variables = {}) {
  const process_ = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--conditions=react-server",
      script,
      ...args,
    ],
    {
      cwd,
      env: {
        ...process.env,
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
        ...variables,
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  process_.stdout.on("data", (chunk) => {
    output += chunk;
  });
  process_.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    process_.once("error", reject);
    process_.once("exit", resolve);
  });
  return { code, output };
}

test("initialization backs up privately, validates offline, and creates only an empty destination", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "family-family-init-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = await redisRestFixture();
  t.after(() => fixture.close());
  const variables = {
    KV_REST_API_URL: fixture.url,
    KV_REST_API_TOKEN: "test-only-token",
  };
  const args = [
    "--input",
    "input.json",
    "--environment",
    "preview",
    "--instance",
    "isolated",
  ];
  await writeFile(
    path.join(directory, "input.json"),
    JSON.stringify(exampleFamily()),
  );
  assert.equal((await run(directory, args, variables)).code, 0);
  assert.equal(fixture.state.commands.length, 0);
  const [backup] = await readdir(path.join(directory, ".data/backups"));
  const backedUp = JSON.parse(
    await readFile(
      path.join(directory, ".data/backups", backup, "family.json"),
      "utf8",
    ),
  );
  assert.equal(backedUp.people.length, 4);
  const result = await run(directory, [...args, "--write"], variables);
  assert.equal(result.code, 0, result.output);
  const key = "family-tree:preview:family:isolated";
  const stored = fixture.state.values.get(key);
  assert.deepEqual(JSON.parse(stored).current, backedUp);
  const second = await run(directory, [...args, "--write"], variables);
  assert.equal(second.code, 1);
  assert.match(second.output, /store initialization/);
  assert.equal(fixture.state.values.get(key), stored);
  assert.equal(
    fixture.state.values.has("family-tree:production:family:main"),
    false,
  );
  const before = fixture.state.commands.length;
  await writeFile(path.join(directory, "input.json"), "{broken");
  const invalid = await run(directory, [...args, "--write"], variables);
  assert.equal(invalid.code, 1);
  assert.match(invalid.output, /input validation/);
  assert.equal(fixture.state.commands.length, before);
  assert.ok(!result.output.includes("Béatrice"));
});
