import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { parseFamilyDocument } from "../src/lib/family-document.ts";
import { projectFamilyDocument } from "../src/lib/family-projection.ts";
import { prepareLoginDatabase } from "./setup-project.mjs";

const require = createRequire(import.meta.url);
export const demoViewerPassword = "demo-family";
export const demoOwnerPassword = "demo-owner";

/** @param {string} password @returns {string} A runtime-compatible disposable hash. */
function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt}:${key.toString("hex")}`;
}

/**
 * Create a fresh demo from the checked-in example and isolate every application
 * setting before preparing SQLite, whose client can load ambient dotenv files.
 * @param {string} directory Checkout root.
 * @param {NodeJS.ProcessEnv} [variables] Environment inherited by the dev server.
 * @returns {Promise<{environment: NodeJS.ProcessEnv, familyFile: string}>}
 */
export async function prepareDemo(directory, variables = process.env) {
  directory = path.resolve(directory);
  const document = parseFamilyDocument(
    JSON.parse(
      await readFile(path.join(directory, "examples/family.json"), "utf8"),
    ),
  );
  projectFamilyDocument(document);

  const dataRoot = path.join(directory, ".data");
  await mkdir(dataRoot, { mode: 0o700 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const stat = await lstat(dataRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("The demo requires a regular .data directory, not a link.");
  const demoDirectory = await mkdtemp(path.join(dataRoot, "demo-"));
  const familyFile = path.join(demoDirectory, "family.json");
  const databaseUrl = `file:${path.join(demoDirectory, "login.sqlite").replaceAll("\\", "/")}`;
  const environment = {
    ...variables,
    NODE_ENV: "development",
    VERCEL: "",
    VERCEL_ENV: "",
    VERCEL_URL: "",
    KV_REST_API_URL: "",
    KV_REST_API_TOKEN: "",
    FAMILY_INSTANCE_ID: "demo",
    FAMILY_DATA_FILE: familyFile,
    DATABASE_URL: databaseUrl,
    PASSWORD_HASH: passwordHash(demoViewerPassword),
    OWNER_PASSWORD_HASH: passwordHash(demoOwnerPassword),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    PASSWORD_RECOVERY: "",
    OWNER_PASSWORD_RECOVERY: "",
    SKIP_ENV_VALIDATION: "",
  };
  await writeFile(familyFile, `${JSON.stringify(document, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await prepareLoginDatabase(directory, databaseUrl);
  return { environment, familyFile };
}

/** Start a loopback-only development server with a fresh fictional family. */
async function main() {
  const { values } = parseArgs({
    options: { port: { type: "string", default: "3000" } },
    allowPositionals: false,
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Use --port with a number between 1 and 65535.");
  const { environment } = await prepareDemo(process.cwd());
  console.log(`Local demo: http://localhost:${port}`);
  console.log(`Viewing password: ${demoViewerPassword}`);
  console.log(`Owner password (/edit): ${demoOwnerPassword}`);
  console.log("Each run starts a fresh example family. Press Ctrl+C to stop.");
  const server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--turbo",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env: environment, windowsHide: true, stdio: "inherit" },
  );
  const stop = () => server.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "The demo could not start.",
    );
    process.exitCode = 1;
  });
}
