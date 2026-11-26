import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

for (const [mode, preferred, initial] of [
  ["choice", "en-US", "fr-FR"],
  ["fr-FR", "en-US", "en-US"],
  ["en-US", "fr-FR", "fr-FR"],
]) {
  test(`language mode ${mode} controls server rendering and selector visibility`, async (t) => {
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
          VERCEL: "",
          KV_REST_API_URL: "",
          KV_REST_API_TOKEN: "",
          DATABASE_URL: "file:/unused/language-test.sqlite",
          PASSWORD_HASH: `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`,
          OWNER_PASSWORD_HASH: `scrypt:${"1".repeat(32)}:${"1".repeat(128)}`,
          SESSION_SECRET: "Disposable language mode test session secret",
          // An unset setting must preserve the existing choice behavior.
          LANGUAGE_MODE: mode === "choice" ? "" : mode,
          DEFAULT_LOCALE: initial,
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    t.after(async () => {
      if (server.exitCode !== null) return;
      const stopped = new Promise((resolve) => server.once("exit", resolve));
      server.kill();
      await stopped;
    });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try {
        if (
          (await fetch(`${base}/login`, { signal: AbortSignal.timeout(2000) }))
            .ok
        ) {
          ready = true;
          break;
        }
      } catch {
        // Wait for the owned production server to start.
      }
      await delay(100);
    }
    assert.ok(ready, output);
    const expected = mode === "choice" ? preferred : mode;
    for (const [route, status] of [
      ["/login", 200],
      ["/edit/login", 200],
      ["/missing-language-page", 404],
    ]) {
      const response = await fetch(`${base}${route}`, {
        headers: { cookie: `family-tree-locale=${preferred}` },
      });
      assert.equal(response.status, status);
      const html = await response.text();
      assert.ok(
        html.includes(`lang="${expected}"`),
        `${route}: expected ${expected}`,
      );
      assert.ok(
        html.includes(
          `<title>${expected === "fr-FR" ? "Arbre familial" : "Family tree"}</title>`,
        ),
      );
      assert.equal(
        /<[^>]+\bdata-language-switcher\b/.test(html),
        mode === "choice",
        route,
      );
    }
  });
}
