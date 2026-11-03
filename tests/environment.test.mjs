import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const environmentUrl = new URL("../src/env.js", import.meta.url).href;
const fakeEnvironment = {
  ...process.env,
  NODE_ENV: "production",
  SKIP_ENV_VALIDATION: "",
  VERCEL: "",
  DATABASE_URL: "file:./test-only.sqlite",
  PASSWORD_HASH: `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`,
  OWNER_PASSWORD_HASH: "",
  SESSION_SECRET: "A disposable environment-validation fixture secret",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
};

for (const { label, variables, missing } of [
  {
    label: "optional owner credential",
    variables: {
      OWNER_PASSWORD_HASH: `scrypt:${"1".repeat(32)}:${"1".repeat(128)}`,
    },
  },
  {
    label: "invalid owner credential",
    variables: { OWNER_PASSWORD_HASH: "invalid" },
    missing: ["OWNER_PASSWORD_HASH"],
  },
  { label: "local SQLite configuration", variables: {} },
  {
    label: "Vercel Redis configuration without a SQLite URL",
    variables: {
      VERCEL: "1",
      DATABASE_URL: "",
      KV_REST_API_URL: "https://fixture.upstash.io",
      KV_REST_API_TOKEN: "test-only-token",
    },
  },
  {
    label: "missing Redis credentials on Vercel",
    variables: { VERCEL: "1" },
    missing: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  },
  {
    label: "Redis URL without a token locally",
    variables: { KV_REST_API_URL: "https://fixture.upstash.io" },
    missing: ["KV_REST_API_TOKEN"],
  },
  {
    label: "Redis token without a URL locally",
    variables: { KV_REST_API_TOKEN: "test-only-token" },
    missing: ["KV_REST_API_URL"],
  },
]) {
  test(`environment validation: ${label}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(environmentUrl)});`,
      ],
      {
        env: { ...fakeEnvironment, ...variables },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (missing) {
      assert.notEqual(result.status, 0);
      for (const name of missing)
        assert.ok(result.stderr.includes(name), result.stderr);
    } else {
      assert.equal(result.status, 0, result.stderr);
    }
  });
}
