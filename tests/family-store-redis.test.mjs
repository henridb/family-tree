import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

import {
  createRedisFamilyStore,
  familyStorageKey,
} from "../src/server/family-store-redis.ts";
import {
  FamilyStoreConflictError,
  FamilyStoreError,
} from "../src/server/family-store.ts";
import {
  exampleFamily,
  redisRestFixture,
} from "./helpers/family-store-fixtures.mjs";

/**
 * Build disposable Redis store settings for the local REST fixture and requested scope.
 * @param {string} url
 * @param {import('../src/server/family-store-redis.ts').FamilyStoreScope['environment']} [environment='development']
 * @param {string} [instanceId='test']
 * @returns {Parameters<typeof createRedisFamilyStore>[0]}
 */
const options = (url, environment = "development", instanceId = "test") => ({
  url,
  token: "test-only-token",
  environment,
  instanceId,
});

test("the actual Upstash SDK preserves raw JSON, revisions and recovery", async (t) => {
  const fixture = await redisRestFixture();
  t.after(() => fixture.close());
  const store = createRedisFamilyStore(options(fixture.url));
  assert.equal(fixture.state.commands.length, 0);
  const first = await store.save(exampleFamily(), null);
  assert.deepEqual(await store.read(), first);
  const second = await store.save({ ...first, title: "Updated" }, 0);
  assert.deepEqual(await store.history(), [first]);
  const restored = await store.restore(0, second.revision);
  assert.equal(restored.revision, 2);
  assert.equal(restored.title, first.title);
  assert.deepEqual(JSON.parse(await store.exportJson()), restored);
  await assert.rejects(
    store.save(exampleFamily(), 0),
    FamilyStoreConflictError,
  );
});

test("production, previews and development instances use isolated family keys", async (t) => {
  const fixture = await redisRestFixture();
  t.after(() => fixture.close());
  const scopes = [
    ["production", "tree"],
    ["preview", "branch-one"],
    ["preview", "branch-two"],
    ["development", "tree"],
  ];
  for (const [environment, instanceId] of scopes) {
    const store = createRedisFamilyStore(
      options(fixture.url, environment, instanceId),
    );
    assert.equal(await store.read(), null);
    await store.save(exampleFamily(`${environment}/${instanceId}`), null);
  }
  for (const [environment, instanceId] of scopes) {
    const store = createRedisFamilyStore(
      options(fixture.url, environment, instanceId),
    );
    assert.equal((await store.read()).title, `${environment}/${instanceId}`);
  }
  assert.equal(fixture.state.values.size, scopes.length);
  assert.throws(() =>
    familyStorageKey({ environment: "other", instanceId: "tree" }),
  );
  assert.throws(() =>
    familyStorageKey({ environment: "preview", instanceId: "" }),
  );
  assert.throws(() =>
    createRedisFamilyStore(options(fixture.url, "production", "unsafe:key")),
  );
});

test("SDK errors and invalid replies fail without automatic write retries", async (t) => {
  const fixture = await redisRestFixture();
  t.after(() => fixture.close());
  const store = createRedisFamilyStore(options(fixture.url));
  await store.save(exampleFamily(), null);
  fixture.state.unavailable = true;
  const previous = fixture.state.commands.length;
  await assert.rejects(
    store.read(),
    (error) =>
      error instanceof FamilyStoreError && error.code === "UNAVAILABLE",
  );
  assert.equal(fixture.state.commands.length, previous + 1);
  fixture.state.unavailable = false;
  fixture.state.invalidResult = true;
  await assert.rejects(
    store.read(),
    (error) =>
      error instanceof FamilyStoreError && error.code === "UNAVAILABLE",
  );
});

const hasRedis =
  spawnSync("redis-server", ["--version"], { windowsHide: true }).status ===
    0 &&
  spawnSync("redis-cli", ["--version"], { windowsHide: true }).status === 0;

test(
  "real Redis executes the atomic Lua save with competing editors",
  {
    skip: hasRedis ? false : "redis-server and redis-cli are not installed",
  },
  async (t) => {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const server = spawn(
      "redis-server",
      [
        "--bind",
        "127.0.0.1",
        "--port",
        String(port),
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    t.after(async () => {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
      }
    });
    /**
     * Execute a command against this test's loopback Redis server and decode
     * its JSON response.
     * @param {readonly (string | number)[]} args Redis command and arguments.
     * @returns {unknown} Decoded Redis reply; callers assert its expected shape.
     */
    const command = (args) =>
      JSON.parse(
        execFileSync(
          "redis-cli",
          [
            "-h",
            "127.0.0.1",
            "-p",
            String(port),
            "--json",
            ...args.map(String),
          ],
          {
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        ),
      );
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if (command(["ping"]) === "PONG") {
          ready = true;
          break;
        }
      } catch {
        /* Wait for this test's Redis process. */
      }
      await delay(50);
    }
    assert.ok(ready, "Redis test server did not start");
    const fixture = await redisRestFixture((args) => command(args));
    t.after(() => fixture.close());
    const first = createRedisFamilyStore(options(fixture.url));
    const second = createRedisFamilyStore(options(fixture.url));
    /**
     * Submit two competing saves against the same expected revision and retain
     * both outcomes.
     * @param {number | null} revision Null for competing initializations, otherwise the expected revision.
     * @returns {Promise<PromiseSettledResult<import('../src/lib/family-document.ts').FamilyDocument>[]>}
     */
    const races = async (revision) =>
      Promise.allSettled([
        first.save(exampleFamily("First"), revision),
        second.save(exampleFamily("Second"), revision),
      ]);
    for (const revision of [null, 0]) {
      const results = await races(revision);
      assert.equal(
        results.filter(({ status }) => status === "fulfilled").length,
        1,
      );
      assert.ok(
        results.find(({ status }) => status === "rejected").reason instanceof
          FamilyStoreConflictError,
      );
    }
    const current = await first.read();
    assert.equal(current.revision, 1);
    assert.equal((await first.history()).length, 1);
    const restored = await first.restore(0, 1);
    assert.equal(restored.revision, 2);
    const key = familyStorageKey({
      environment: "development",
      instanceId: "test",
    });
    assert.equal(command(["ttl", key]), -1);
  },
);
