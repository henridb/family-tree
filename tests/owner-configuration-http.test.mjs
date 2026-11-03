import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { scryptSync } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const password = "Shared test-only password";
const salt = "1".repeat(32);
const hash = `scrypt:${salt}:${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;

for (const configured of [false, true]) {
  test(
    configured
      ? "reusing the viewing password cannot start an owner session"
      : "an installation without owner configuration keeps editing disabled",
    async (t) => {
      let attempts = 0;
      const redis = createHttpServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks).toString());
        const pipelined = Array.isArray(payload[0]);
        const commands = pipelined ? payload : [payload];
        attempts += commands.length;
        response.setHeader("content-type", "application/json");
        const results = commands.map(() => ({ result: 1 }));
        response.end(JSON.stringify(pipelined ? results : results[0]));
      });
      await new Promise((resolve) => redis.listen(0, "127.0.0.1", resolve));
      t.after(
        () =>
          new Promise((resolve) => {
            redis.closeAllConnections();
            redis.close(resolve);
          }),
      );
      const socket = createServer();
      await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
      const port = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
      const base = `http://127.0.0.1:${port}`;
      const server = spawn(
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
          env: {
            ...process.env,
            NODE_ENV: "production",
            NEXT_TELEMETRY_DISABLED: "1",
            VERCEL: "1",
            VERCEL_ENV: "production",
            PASSWORD_HASH: hash,
            OWNER_PASSWORD_HASH: configured ? hash : "",
            SESSION_SECRET: "Disposable owner-configuration test secret",
            KV_REST_API_URL: `http://127.0.0.1:${redis.address().port}`,
            KV_REST_API_TOKEN: "test-only-token",
            FAMILY_DATA_FILE: "",
            FAMILY_INSTANCE_ID: "main",
            DATABASE_URL: "file:/unavailable/fixture.sqlite",
          },
          windowsHide: true,
          stdio: "ignore",
        },
      );
      t.after(async () => {
        if (server.exitCode !== null) return;
        const closed = new Promise((resolve) => server.once("exit", resolve));
        server.kill();
        await closed;
      });
      let page;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          page = await fetch(`${base}/edit/login`, {
            signal: AbortSignal.timeout(2000),
          });
          if (page.status === 200) break;
        } catch {
          /* Wait for the owned server. */
        }
        await delay(100);
      }
      assert.equal(page?.status, 200);
      if (!configured) assert.match(await page.text(), /Édition non activée/);
      let cookie = "";
      const api = createTRPCClient({
        links: [
          httpBatchLink({
            url: `${base}/api/trpc`,
            transformer: superjson,
            headers: { origin: base },
            /**
             * Capture any session cookie emitted by the owner-configuration test request.
             * @param {Parameters<typeof fetch>[0]} url
             * @param {Parameters<typeof fetch>[1]} [options]
             * @returns {Promise<Response>}
             */
            fetch: async (url, options) => {
              const response = await fetch(url, options);
              cookie = response.headers.get("set-cookie") ?? "";
              return response;
            },
          }),
        ],
      });
      await assert.rejects(
        api.editor.login.mutate(password),
        (error) => error.data?.code === "PRECONDITION_FAILED",
      );
      assert.equal(cookie, "");
      await assert.rejects(
        api.editor.read.query(),
        (error) => error.data?.code === "UNAUTHORIZED",
      );
      assert.equal(attempts, configured ? 1 : 0);
    },
  );
}
