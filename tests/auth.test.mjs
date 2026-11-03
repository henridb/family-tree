import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { PrismaClient } from "@prisma/client";
import { sealData } from "iron-session";
import superjson from "superjson";
import { exampleFamily } from "./helpers/family-store-fixtures.mjs";

/**
 * @typedef {object} AuthTestClient
 * @property {import('@trpc/client').TRPCClient<import('../src/server/api/root.ts').AppRouter>} api
 * @property {{cookie: string, setCookie: string, requests: {method: string, url: string}[]}} state
 */

const directory = mkdtempSync(path.join(tmpdir(), "family-auth-test-"));
const familyFile = path.join(directory, "family.json");
let familyValue;
let familyRequests = 0;
/**
 * Reset the test family in both the local file and the in-memory hosted-storage fixture.
 * @param {import('../src/lib/family-document.ts').FamilyDocumentInput} [document]
 * @returns {void}
 */
function setFamily(document = exampleFamily()) {
  writeFileSync(familyFile, JSON.stringify(document));
  familyValue = JSON.stringify({
    formatVersion: 1,
    current: document,
    history: [],
  });
}
const databaseUrl = `file:${path.join(directory, "test.sqlite").replaceAll("\\", "/")}`;
const password = "A test-only password";
const ownerPassword = "A separate test-only owner password";
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}).toString("hex");
const passwordHash = `scrypt:${salt}:${hash}`;
const ownerHash = `scrypt:${salt}:${scryptSync(ownerPassword, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const secret = randomBytes(32).toString("hex");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const useRedis = process.env.FAMILY_TREE_TEST_LOGIN_STORE === "redis";
let redisServer;
let redisUrl;
let redisBudget;
let redisFailure = false;
let redisInvalidResult = false;
let redisRequests = 0;
let server;
let baseUrl;
let serverOutput = "";

/**
 * Create an isolated tRPC test client with configurable origin, cookie
 * persistence and request recording.
 * @param {string} [initialCookie=''] Serialized Cookie request header.
 * @param {string} [origin] Override the fixture server's default Origin.
 * @returns {AuthTestClient}
 */
function client(initialCookie = "", origin) {
  const state = { cookie: initialCookie, setCookie: "", requests: [] };
  const api = createTRPCClient({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        transformer: superjson,
        /**
         * Send the fixture origin and the client's latest saved cookie with each request.
         * @returns {{origin: string, cookie: string}}
         */
        headers: () => ({ origin: origin ?? baseUrl, cookie: state.cookie }),
        /**
         * Record the outgoing request and retain the session cookie returned by
         * the test server.
         * @param {Parameters<typeof fetch>[0]} url
         * @param {Parameters<typeof fetch>[1]} [options]
         * @returns {Promise<Response>}
         */
        fetch: async (url, options) => {
          state.requests.push({
            method: options?.method ?? "GET",
            url: String(url),
          });
          const response = await fetch(url, options);
          const cookie = response.headers.get("set-cookie");
          if (cookie) {
            state.setCookie = cookie;
            state.cookie = cookie.split(";")[0];
          }
          return response;
        },
      }),
    ],
  });
  return { api, state };
}

before(async () => {
  if (useRedis) {
    // An offline REST fixture exercises the actual SDK and production HTTP path.
    // It models the counter response; it does not execute Redis's Lua engine.
    redisServer = createHttpServer(async (request, response) => {
      try {
        assert.equal(request.headers.authorization, "Bearer test-only-token");
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const pipelined = Array.isArray(payload[0]);
        const commands = pipelined ? payload : [payload];
        redisRequests += commands.filter(
          (command) =>
            command[0].toLowerCase() === "eval" &&
            command[3] === "family-tree:production:login-attempts",
        ).length;
        response.setHeader("content-type", "application/json");
        if (redisFailure) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "Fixture store unavailable" }));
          return;
        }
        const results = commands.map(
          ([
            command,
            script,
            keyCount,
            key,
            windowMs,
            maxAttempts,
            replacement,
          ]) => {
            if (command.toLowerCase() === "get") {
              familyRequests++;
              assert.equal(script, "family-tree:production:family:main");
              return { result: familyValue };
            }
            if (key === "family-tree:production:family:main") {
              familyRequests++;
              assert.equal(command.toLowerCase(), "eval");
              assert.equal(keyCount, 1);
              const accepted =
                windowMs === "missing"
                  ? familyValue === null
                  : familyValue === maxAttempts;
              if (accepted) familyValue = replacement;
              return { result: accepted ? 1 : 0 };
            }
            assert.equal(command.toLowerCase(), "eval");
            assert.equal(typeof script, "string");
            assert.equal(keyCount, 1);
            assert.equal(key, "family-tree:production:login-attempts");
            assert.equal(Number(windowMs), 60_000);
            assert.equal(Number(maxAttempts), 20);
            if (
              !redisBudget ||
              redisBudget.windowStart <= Date.now() - windowMs
            ) {
              redisBudget = { attempts: 0, windowStart: Date.now() };
            }
            redisBudget.attempts = Math.min(redisBudget.attempts + 1, 21);
            return { result: redisInvalidResult ? null : redisBudget.attempts };
          },
        );
        response.end(JSON.stringify(pipelined ? results : results[0]));
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: error.message }));
      }
    });
    await new Promise((resolve) => redisServer.listen(0, "127.0.0.1", resolve));
    redisUrl = `http://127.0.0.1:${redisServer.address().port}`;
  } else {
    // Create the fixture file explicitly before Prisma initializes its schema.
    writeFileSync(path.join(directory, "test.sqlite"), "");
  }
  const environment = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    // The Vercel path must work without access to any SQLite file.
    DATABASE_URL: useRedis
      ? "file:/unavailable-family-fixture/db.sqlite"
      : databaseUrl,
    VERCEL: useRedis ? "1" : "",
    VERCEL_ENV: useRedis ? "production" : "development",
    KV_REST_API_URL: redisUrl ?? "",
    KV_REST_API_TOKEN: useRedis ? "test-only-token" : "",
    FAMILY_DATA_FILE: useRedis ? "" : familyFile,
    FAMILY_INSTANCE_ID: "main",
    PASSWORD_HASH: passwordHash,
    OWNER_PASSWORD_HASH: ownerHash,
    SESSION_SECRET: secret,
  };
  if (!useRedis)
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
      {
        env: environment,
        windowsHide: true,
        stdio: "pipe",
      },
    );
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      /* Wait for the local server to listen. */
    }
    await delay(100);
  }
  throw new Error(`Server did not start: ${serverOutput}`);
});

beforeEach(async () => {
  setFamily();
  familyRequests = 0;
  if (useRedis) {
    redisBudget = undefined;
    redisFailure = false;
    redisInvalidResult = false;
    redisRequests = 0;
  } else {
    await db.loginRateLimit.deleteMany();
  }
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  await db.$disconnect();
  if (redisServer) await new Promise((resolve) => redisServer.close(resolve));
  assert.ok(
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep),
  );
  assert.ok(path.basename(directory).startsWith("family-auth-test-"));
  rmSync(directory, { recursive: true, force: true });
});

test("anonymous and forged sessions cannot read the family tree", async () => {
  const response = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(
    new URL(response.headers.get("location"), baseUrl).pathname,
    "/login",
  );
  for (const cookie of ["", "__Host-family-session=forged; loggedIn=true"]) {
    const { api } = client(cookie);
    await assert.rejects(
      api.person.getTree.query(),
      (error) => error.data?.code === "UNAUTHORIZED",
    );
  }
  if (!useRedis) assert.equal(await db.post.count(), 0);
  assert.equal(familyRequests, 0);
});

test("login validates credentials and lets returning visitors reuse their session", async () => {
  const { api, state } = client();
  await assert.rejects(
    api.login.login.mutate("wrong password"),
    (error) => error.data?.code === "UNAUTHORIZED",
  );
  assert.equal(state.cookie, "");
  await api.login.login.mutate(password);
  assert.match(state.setCookie, /HttpOnly/i);
  assert.match(state.setCookie, /Secure/i);
  assert.match(state.setCookie, /SameSite=Lax/i);
  assert.match(state.cookie, /^__Host-family-session=/);
  assert.ok(
    state.requests.every(
      (request) =>
        request.method === "POST" &&
        !decodeURIComponent(request.url).includes(password),
    ),
  );
  const returningVisitor = client(state.cookie);
  const tree = await returningVisitor.api.person.getTree.query();
  assert.ok(tree.name);
  const ids = [];
  /**
   * Append each branch and partner ID to the test's identity list.
   * @param {import('../src/types/family.ts').person} value
   * @returns {void}
   */
  function collectIds(value) {
    ids.push(value.id);
    for (const partner of value.partners ?? []) {
      ids.push(partner.id);
      partner.children?.forEach(collectIds);
    }
  }
  collectIds(tree);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
  assert.equal(tree.birthdate, "1940");
  assert.equal(tree.partners[0].children[0].birthdate, "1970-02");
  const page = await fetch(baseUrl, { headers: { cookie: state.cookie } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control"), /no-store|private/);
  const result = await fetch(`${baseUrl}/api/trpc/person.getTree`, {
    headers: { cookie: state.cookie },
  });
  assert.match(result.headers.get("cache-control"), /private, no-store/);
});

test("family updates are visible without a deployment; empty and unset-root states remain distinct", async () => {
  const loggedIn = client();
  await loggedIn.api.login.login.mutate(password);
  const document = exampleFamily();
  document.people[0].name = "Changed";
  setFamily(document);
  assert.equal((await loggedIn.api.person.getTree.query()).name, "Changed");
  document.rootPersonId = null;
  setFamily(document);
  assert.equal(await loggedIn.api.person.getTree.query(), null);
  unlinkSync(familyFile);
  familyValue = null;
  await assert.rejects(
    loggedIn.api.person.getTree.query(),
    (error) => error.data?.code === "PRECONDITION_FAILED",
  );
});

test("corrupt family data fails with a generic error and no fallback", async () => {
  const loggedIn = client();
  await loggedIn.api.login.login.mutate(password);
  writeFileSync(familyFile, "private invalid data");
  familyValue = "private invalid data";
  await assert.rejects(loggedIn.api.person.getTree.query(), (error) => {
    assert.equal(error.data?.code, "SERVICE_UNAVAILABLE");
    assert.equal(error.data?.zodError, null);
    assert.ok(!error.message.includes("private invalid data"));
    return true;
  });
});

test("invalid login inputs keep validation errors without reserving attempts", async () => {
  const { api, state } = client();
  for (const input of ["", "x".repeat(1025), 42]) {
    await assert.rejects(api.login.login.mutate(input), (error) => {
      assert.equal(error.data?.code, "BAD_REQUEST");
      assert.ok(error.data.zodError.formErrors.length > 0);
      assert.deepEqual(error.data.zodError.fieldErrors, {});
      return true;
    });
  }
  assert.equal(state.cookie, "");
  assert.equal(useRedis ? redisRequests : await db.loginRateLimit.count(), 0);
});

test("viewing sessions cannot read or modify owner data, including when copied into the owner cookie", async () => {
  const viewer = client();
  await viewer.api.login.login.mutate(password);
  for (const cookie of [
    "",
    viewer.state.cookie,
    viewer.state.cookie.replace(
      "__Host-family-session",
      "__Host-family-owner-session",
    ),
  ]) {
    const { api } = client(cookie);
    for (const request of [
      () => api.editor.read.query(),
      () =>
        api.editor.save.mutate({
          document: exampleFamily(),
          expectedRevision: 0,
        }),
      () => api.editor.restore.mutate({ revision: 0, expectedRevision: 0 }),
      () => api.editor.logout.mutate(),
    ])
      await assert.rejects(
        request(),
        (error) => error.data?.code === "UNAUTHORIZED",
      );
  }
  assert.equal(familyRequests, 0);
});

test("owners can save, see changes as viewers, recover revisions, and sign out without granting viewer edit access", async () => {
  const owner = client();
  await assert.rejects(
    owner.api.editor.login.mutate(password),
    (error) => error.data?.code === "UNAUTHORIZED",
  );
  await owner.api.editor.login.mutate(ownerPassword);
  assert.match(owner.state.cookie, /^__Host-family-owner-session=/);
  assert.match(owner.state.setCookie, /HttpOnly/i);
  const original = await owner.api.editor.read.query();
  assert.equal(original.document.people.length, 4);
  const document = structuredClone(original.document);
  document.people[0].name = "Owner correction";
  const saved = await owner.api.editor.save.mutate({
    document,
    expectedRevision: 0,
  });
  assert.equal(saved.revision, 1);
  assert.equal(
    (await fetch(baseUrl, { headers: { cookie: owner.state.cookie } })).status,
    200,
  );
  assert.equal(
    (await owner.api.person.getTree.query()).name,
    "Owner correction",
  );
  await assert.rejects(
    owner.api.editor.save.mutate({ document, expectedRevision: 0 }),
    (error) => error.data?.code === "CONFLICT",
  );
  const invalid = structuredClone(saved);
  invalid.people[0].birthdate = "2000-02-31";
  await assert.rejects(
    owner.api.editor.save.mutate({ document: invalid, expectedRevision: 1 }),
    (error) => error.data?.code === "BAD_REQUEST",
  );
  const unsupported = structuredClone(saved);
  unsupported.people.push({
    id: "another",
    name: "Other",
    surname: "Person",
    sex: "male",
    dead: false,
  });
  unsupported.partnerships.push({
    id: "otherunion",
    personIds: ["bea", "another"],
    childIds: [],
    divorced: false,
  });
  await assert.rejects(
    owner.api.editor.save.mutate({
      document: unsupported,
      expectedRevision: 1,
    }),
    (error) => error.data?.code === "BAD_REQUEST",
  );
  assert.equal((await owner.api.editor.read.query()).document.revision, 1);
  const viewer = client();
  await viewer.api.login.login.mutate(password);
  assert.equal(
    (await viewer.api.person.getTree.query()).name,
    "Owner correction",
  );
  const restored = await owner.api.editor.restore.mutate({
    revision: 0,
    expectedRevision: 1,
  });
  assert.equal(restored.revision, 2);
  assert.equal(restored.people[0].name, "Alex");
  assert.deepEqual(
    (await owner.api.editor.read.query()).history.map((x) => x.revision),
    [1, 0],
  );
  await owner.api.editor.logout.mutate();
  await assert.rejects(
    owner.api.person.getTree.query(),
    (error) => error.data?.code === "UNAUTHORIZED",
  );
  await assert.rejects(
    owner.api.editor.read.query(),
    (error) => error.data?.code === "UNAUTHORIZED",
  );
  assert.equal((await viewer.api.person.getTree.query()).name, "Alex");
});

test("expired owner sessions and old owner credentials cannot authorize writes", async () => {
  for (const payload of [
    {
      owner: true,
      authenticated: true,
      expiresAt: Date.now() - 1000,
      credentialVersion: createHash("sha256").update(ownerHash).digest("hex"),
    },
    {
      owner: true,
      authenticated: true,
      expiresAt: Date.now() + 60_000,
      credentialVersion: "old owner credential",
    },
  ]) {
    const seal = await sealData(payload, { password: secret, ttl: 60 });
    await assert.rejects(
      client(`__Host-family-owner-session=${seal}`).api.editor.save.mutate({
        document: exampleFamily(),
        expectedRevision: 0,
      }),
      (error) => error.data?.code === "UNAUTHORIZED",
    );
  }
});

test("removed scaffold endpoints remain unavailable to anonymous and authenticated callers", async () => {
  const loggedIn = client();
  await loggedIn.api.login.login.mutate(password);
  for (const cookie of ["", loggedIn.state.cookie]) {
    const { api } = client(cookie);
    await assert.rejects(
      api.person.getById.query({ id: 1 }),
      (error) => error.data?.code === "NOT_FOUND",
    );
    await assert.rejects(
      api.post.create.mutate({ name: "Must not be saved" }),
      (error) => error.data?.code === "NOT_FOUND",
    );
  }
  if (!useRedis) assert.equal(await db.post.count(), 0);
});

test("expired sessions and sessions from an old password cannot authorize requests", async () => {
  const currentVersion = createHash("sha256")
    .update(passwordHash)
    .digest("hex");
  for (const payload of [
    {
      authenticated: true,
      expiresAt: Date.now() - 1000,
      credentialVersion: currentVersion,
    },
    {
      authenticated: true,
      expiresAt: Date.now() + 60_000,
      credentialVersion: "previous password",
    },
  ]) {
    const seal = await sealData(payload, { password: secret, ttl: 60 });
    await assert.rejects(
      client(`__Host-family-session=${seal}`).api.person.getTree.query(),
      (error) => error.data?.code === "UNAUTHORIZED",
    );
  }
});

test("mutations reject foreign origins and the login procedure cannot be called with GET", async () => {
  const denied = await fetch(`${baseUrl}/api/trpc/login.login`, {
    method: "POST",
    headers: {
      origin: "https://untrusted.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: password }),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("set-cookie"), null);
  const get = await fetch(
    `${baseUrl}/api/trpc/login.login?input=${encodeURIComponent(JSON.stringify({ json: password }))}`,
  );
  assert.equal(get.status, 405);
});

test("a shared atomic login budget survives different clients and resets after its window", async () => {
  if (useRedis) {
    redisBudget = { attempts: 19, windowStart: Date.now() };
  } else
    await db.loginRateLimit.create({
      data: {
        id: "family-login",
        attempts: 19,
        windowStart: BigInt(Date.now()),
      },
    });
  const results = await Promise.allSettled([
    client().api.login.login.mutate("wrong"),
    client().api.login.login.mutate("wrong"),
  ]);
  const codes = results
    .map((result) =>
      result.status === "rejected" ? result.reason.data?.code : "accepted",
    )
    .sort();
  assert.deepEqual(codes, ["TOO_MANY_REQUESTS", "UNAUTHORIZED"]);
  await assert.rejects(
    client().api.login.login.mutate(password),
    (error) => error.data?.code === "TOO_MANY_REQUESTS",
  );
  if (useRedis) {
    redisBudget.windowStart = Date.now() - 61_000;
  } else
    await db.loginRateLimit.update({
      where: { id: "family-login" },
      data: { windowStart: BigInt(Date.now() - 61_000) },
    });
  await client().api.login.login.mutate(password);
});

test(
  "Redis failures reject login without issuing a session or falling back to SQLite",
  {
    skip: !useRedis,
  },
  async () => {
    for (const invalidResult of [false, true]) {
      redisFailure = !invalidResult;
      redisInvalidResult = invalidResult;
      const { api, state } = client();
      await assert.rejects(
        api.login.login.mutate(password),
        (error) => error.data?.code === "INTERNAL_SERVER_ERROR",
      );
      assert.equal(state.cookie, "");
    }
    assert.equal(redisRequests, 2);
  },
);
