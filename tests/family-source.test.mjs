import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readFamilyDocument } from "../src/server/family-source.ts";
import { createRedisFamilyStore } from "../src/server/family-store-redis.ts";
import {
  exampleFamily,
  redisRestFixture,
} from "./helpers/family-store-fixtures.mjs";

test("local reads use only the private file, including when Redis credentials are present", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "family-family-source-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "family.json");
  const variables = {
    FAMILY_DATA_FILE: file,
    VERCEL_ENV: "production",
    KV_REST_API_URL: "https://must-not-be-contacted.invalid",
    KV_REST_API_TOKEN: "test-only-token",
  };
  assert.equal(await readFamilyDocument(variables), null);
  await writeFile(file, JSON.stringify(exampleFamily()));
  assert.equal((await readFamilyDocument(variables)).people[0].name, "Alex");
  await writeFile(file, JSON.stringify(exampleFamily("Updated")));
  assert.equal((await readFamilyDocument(variables)).title, "Updated");
  await writeFile(file, "invalid JSON");
  await assert.rejects(readFamilyDocument(variables), {
    code: "INVALID_STORED_DATA",
  });
  await assert.rejects(readFamilyDocument({ FAMILY_DATA_FILE: directory }), {
    code: "UNAVAILABLE",
  });
});

test("Vercel reads the selected instance/environment and never seeds, falls back, or writes", async (t) => {
  const fixture = await redisRestFixture();
  t.after(() => fixture.close());
  const options = {
    url: fixture.url,
    token: "test-only-token",
    instanceId: "main",
  };
  await createRedisFamilyStore({ ...options, environment: "production" }).save(
    exampleFamily("Production"),
    null,
  );
  await createRedisFamilyStore({ ...options, environment: "preview" }).save(
    exampleFamily("Preview"),
    null,
  );
  const variables = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    KV_REST_API_URL: fixture.url,
    KV_REST_API_TOKEN: options.token,
  };
  fixture.state.commands.length = 0;
  assert.equal((await readFamilyDocument(variables)).title, "Production");
  assert.equal(
    (await readFamilyDocument({ ...variables, FAMILY_INSTANCE_ID: "" })).title,
    "Production",
  );
  assert.equal(
    (await readFamilyDocument({ ...variables, VERCEL_ENV: "preview" })).title,
    "Preview",
  );
  assert.equal(
    await readFamilyDocument({ ...variables, FAMILY_INSTANCE_ID: "empty" }),
    null,
  );
  assert.ok(
    fixture.state.commands.every(
      (command) => command[0].toLowerCase() === "get",
    ),
  );
  const before = fixture.state.commands.length;
  for (const overrides of [
    { VERCEL_ENV: "" },
    { VERCEL_ENV: "custom" },
    { FAMILY_DATA_FILE: ".data/family.json" },
    { FAMILY_INSTANCE_ID: "../bad" },
  ])
    await assert.rejects(readFamilyDocument({ ...variables, ...overrides }));
  assert.equal(fixture.state.commands.length, before);
  fixture.state.values.set("family-tree:production:family:main", "corrupt");
  await assert.rejects(readFamilyDocument(variables), {
    code: "INVALID_STORED_DATA",
  });
});
