import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

import { configureAuth } from "./auth-configuration.mjs";
import { parseFamilyDocument } from "../src/lib/family-document.ts";
import { importFamilyJson } from "../src/lib/family-json.ts";
import {
  FamilyProjectionError,
  projectFamilyDocument,
} from "../src/lib/family-projection.ts";
import { createFileFamilyStore } from "../src/server/family-store-file.ts";

/** @typedef {import('../src/lib/family-document.ts').FamilyDocument} FamilyDocument */

/**
 * @typedef {object} PromptOptions
 * @property {boolean} [secret=false] Hide terminal input while asking this question.
 */

/**
 * @callback Ask
 * @param {string} question
 * @param {PromptOptions} [options]
 * @returns {Promise<string>} Answer text, or a rejection when cancelled.
 */

/**
 * @callback Report
 * @param {string} message Status text that contains no credentials or imported records.
 * @returns {void}
 */

/**
 * @callback PrepareDatabase
 * @param {string} directory Absolute checkout directory.
 * @param {string} url Configured SQLite file URL.
 * @returns {Promise<void>}
 */

/**
 * @typedef {object} SetupOptions
 * @property {string} directory Checkout directory to configure.
 * @property {Ask} ask Interactive or test-provided question handler.
 * @property {Report} [info] Receives safe progress messages.
 * @property {NodeJS.ProcessEnv} [variables] Shell environment to check for overrides.
 * @property {PrepareDatabase} [prepareDatabase] Local database preparation operation.
 */

/**
 * @typedef {object} SetupResult
 * @property {string} familyFile Absolute local family file path.
 * @property {boolean} configurationChanged Whether this run saved .env changes.
 * @property {boolean} familyCreated Whether this run initialized the family.
 * @property {'redis' | 'sqlite'} loginStore Configured login-counter backend.
 */

const require = createRequire(import.meta.url);
const managedKeys = [
  "PASSWORD_HASH",
  "OWNER_PASSWORD_HASH",
  "SESSION_SECRET",
  "PASSWORD_RECOVERY",
  "OWNER_PASSWORD_RECOVERY",
  "DATABASE_URL",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "FAMILY_DATA_FILE",
  "FAMILY_INSTANCE_ID",
  "VERCEL",
  "VERCEL_ENV",
  "SKIP_ENV_VALIDATION",
];
const hashPattern = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/;

/** Identify a setup failure whose message is safe to display without private input or diagnostics. */
export class SetupError extends Error {}

/**
 * Read an optional regular file, distinguishing absence from an unreadable or symlinked configuration.
 * @param {string} file
 * @returns {Promise<string | null>} UTF-8 contents, or null only when the file is absent.
 */
async function readOptional(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new SetupError(
        "Setup requires regular configuration and data files, not links or directories.",
      );
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Resolve dotenv expansion through Next.js in a fresh process without changing the caller's environment.
 * @param {string} configuration Dotenv contents to resolve.
 * @param {NodeJS.ProcessEnv} [variables={}] Environment available during variable expansion.
 * @returns {NodeJS.ProcessEnv} Managed setting names mapped to resolved strings or undefined.
 */
export function configurationValues(configuration, variables = {}) {
  const script = `
    const { processEnv } = require(process.argv[1]);
    const contents = require('node:fs').readFileSync(0, 'utf8');
    const [env] = processEnv([{path: '.env', contents, env: {}}], undefined,
      {info() {}, error() { throw new Error('Invalid environment file'); }}, true);
    const keys = JSON.parse(process.argv[2]);
    process.stdout.write(JSON.stringify(Object.fromEntries(keys.map(key => [key, env[key]]))));
  `;
  try {
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          script,
          require.resolve("@next/env"),
          JSON.stringify(managedKeys),
        ],
        {
          input: configuration,
          encoding: "utf8",
          env: { ...variables, NODE_ENV: "development" },
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      ),
    );
  } catch {
    throw new SetupError(
      "The .env configuration could not be read. Check its syntax before running setup again.",
    );
  }
}

/**
 * Refuse hidden overrides so setup's .env changes match what local Next.js will actually use.
 * @param {string} directory
 * @param {NodeJS.ProcessEnv} variables
 * @returns {Promise<void>}
 */
async function checkOverrides(directory, variables) {
  if (variables.NODE_ENV && variables.NODE_ENV !== "development")
    throw new SetupError(
      "Run local setup with NODE_ENV unset or set to development.",
    );
  if (managedKeys.some((key) => variables[key] !== undefined))
    throw new SetupError(
      "Application settings are set in the shell. Unset them before setup; this command manages the checkout's .env file.",
    );
  for (const name of [
    ".env.local",
    ".env.development",
    ".env.development.local",
  ]) {
    const text = await readOptional(path.join(directory, name));
    if (
      text !== null &&
      managedKeys.some((key) => Object.hasOwn(parseEnv(text), key))
    )
      throw new SetupError(
        `${name} overrides application settings. Consolidate them into .env before setup; no configuration was replaced.`,
      );
  }
}

/**
 * Reject malformed existing credentials and incomplete Redis settings rather than replacing them.
 * @param {NodeJS.ProcessEnv} values Resolved configuration, which may still be incomplete.
 * @param {boolean} [complete=false] Also require both password hashes and a session secret.
 * @returns {void}
 */
function validateSettings(values, complete = false) {
  for (const key of ["PASSWORD_HASH", "OWNER_PASSWORD_HASH"])
    if (values[key] && !hashPattern.test(values[key]))
      throw new SetupError(
        `${key} is invalid. Use the corresponding auth:configure command to repair it explicitly.`,
      );
  if (values.SESSION_SECRET && values.SESSION_SECRET.length < 32)
    throw new SetupError(
      "SESSION_SECRET must contain at least 32 characters. Setup will not replace an existing secret.",
    );
  if (
    complete &&
    (!values.PASSWORD_HASH ||
      !values.OWNER_PASSWORD_HASH ||
      !values.SESSION_SECRET)
  )
    throw new SetupError(
      "Both passwords and a session secret are required to complete editor setup.",
    );
  if (values.VERCEL || values.SKIP_ENV_VALIDATION)
    throw new SetupError(
      "Remove VERCEL and SKIP_ENV_VALIDATION from local configuration before setup.",
    );
  if (
    values.FAMILY_INSTANCE_ID &&
    !/^[a-zA-Z0-9_-]{1,128}$/.test(values.FAMILY_INSTANCE_ID)
  )
    throw new SetupError(
      "FAMILY_INSTANCE_ID must use 1–128 letters, numbers, underscores or hyphens.",
    );
  if (!!values.KV_REST_API_URL !== !!values.KV_REST_API_TOKEN)
    throw new SetupError(
      "Configure both Redis REST settings or leave both empty for local SQLite login.",
    );
  if (
    values.KV_REST_API_URL &&
    !z.url().safeParse(values.KV_REST_API_URL).success
  )
    throw new SetupError(
      "KV_REST_API_URL is invalid. Check the private configuration.",
    );
  if (values.DATABASE_URL && !z.url().safeParse(values.DATABASE_URL).success)
    throw new SetupError(
      "DATABASE_URL is invalid. Check the private configuration.",
    );
}

/**
 * Require newly created private data to stay under the checkout's ignored .data directory.
 * @param {string} directory
 * @param {string} file Absolute proposed family file path.
 * @returns {void}
 */
function privateFamilyPath(directory, file) {
  const relative = path.relative(path.join(directory, ".data"), file);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  )
    throw new SetupError(
      "For initial setup, FAMILY_DATA_FILE must point inside .data. Existing family files elsewhere can be kept; setup will not create a new file there.",
    );
}

/**
 * Create ignored private directories without following directory symlinks out of their intended location.
 * @param {string} directory
 * @param {string} target Absolute directory within .data, including .data itself.
 * @returns {Promise<void>}
 */
async function privateDirectory(directory, target) {
  const root = path.join(directory, ".data");
  const relative = path.relative(root, target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new SetupError("Private setup files must remain inside .data.");
  let current = root;
  for (const segment of ["", ...relative.split(path.sep).filter(Boolean)]) {
    current = path.join(current, segment);
    await mkdir(current, { mode: 0o700 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new SetupError(
        "Private setup directories must not be symlinks. Choose a regular .data directory.",
      );
  }
}

/**
 * Prepare only the local login-budget table, preserving family data, legacy tables and existing attempts.
 * @param {string} directory Checkout directory; relative SQLite URLs resolve from its prisma directory.
 * @param {string} url Plain SQLite file URL without query parameters.
 * @returns {Promise<void>}
 */
export async function prepareLoginDatabase(directory, url) {
  // Prisma loads dotenv on import; keep preflight's shell/config distinction intact.
  const { PrismaClient } = await import("@prisma/client");
  if (!url.startsWith("file:") || /[?#]/.test(url))
    throw new SetupError(
      "Local setup requires a plain SQLite file: DATABASE_URL without query parameters.",
    );
  const location = url.slice(5);
  if (!location || location.startsWith("//"))
    throw new SetupError("DATABASE_URL must identify a local SQLite file.");
  const file = path.resolve(directory, "prisma", location);
  await mkdir(path.dirname(file), { recursive: true });
  const client = new PrismaClient({
    datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } },
    log: [],
  });
  try {
    await client.$executeRaw`CREATE TABLE IF NOT EXISTS "LoginRateLimit" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "attempts" INTEGER NOT NULL,
      "windowStart" BIGINT NOT NULL
    )`;
    const columns = await client.$queryRawUnsafe(
      'PRAGMA table_info("LoginRateLimit")',
    );
    if (
      columns.filter((c) => Number(c.pk) > 0).length !== 1 ||
      !columns.some((c) => c.name === "id" && Number(c.pk) === 1) ||
      !["attempts", "windowStart"].every((name) =>
        columns.some((c) => c.name === name && Number(c.notnull) === 1),
      )
    )
      throw new Error("Incompatible login table");
  } catch {
    throw new SetupError(
      "Local login storage could not be prepared. Check DATABASE_URL, file permissions and the existing LoginRateLimit schema, then rerun setup. Existing data was not reset.",
    );
  } finally {
    await client.$disconnect();
  }
}

/**
 * Save changed configuration atomically, backing up an existing file and rejecting concurrent edits.
 * @param {string} directory
 * @param {string | null} original Originally read contents, or null if .env was absent.
 * @param {string} configuration New dotenv contents.
 * @returns {Promise<void>}
 */
async function saveConfiguration(directory, original, configuration) {
  if (configuration === original) return;
  const file = path.join(directory, ".env");
  if ((await readOptional(file)) !== original)
    throw new SetupError(
      "The .env file changed during setup. Rerun setup to keep the newer configuration.",
    );
  if (original !== null) {
    const backup = path.join(
      directory,
      ".data",
      "backups",
      `setup-${randomUUID()}`,
    );
    await privateDirectory(directory, backup);
    await writeFile(path.join(backup, ".env"), original, {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (original === null) {
    await writeFile(file, configuration, { flag: "wx", mode: 0o600 });
    return;
  }
  const temporary = path.join(directory, `.env.setup-${randomUUID()}.local`);
  try {
    await writeFile(temporary, configuration, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

/**
 * Prompt for a valid, confirmed password and apply it in memory through the existing auth configuration helper.
 * @param {string} configuration
 * @param {boolean} owner Whether to configure owner rather than viewing credentials.
 * @param {Ask} ask
 * @param {Report} info
 * @returns {Promise<string>} Updated dotenv contents; no file has been written yet.
 */
async function configureMissingPassword(configuration, owner, ask, info) {
  for (;;) {
    const label = owner ? "owner" : "shared viewing";
    const password = await ask(`New ${label} password (6–1024 characters): `, {
      secret: true,
    });
    const confirmation = await ask(`Confirm ${label} password: `, {
      secret: true,
    });
    if (password !== confirmation) {
      info("Passwords did not match. Please try again.");
      continue;
    }
    try {
      return configureAuth(configuration, password, { owner });
    } catch (error) {
      if (
        error.message === "Use a password between 6 and 1024 characters." ||
        error.message ===
          "The owner password must differ from the shared viewing password."
      )
        info(error.message);
      else
        throw new SetupError(
          "Password configuration could not be completed. Check that existing password hashes are stored directly in .env, then rerun setup.",
        );
    }
  }
}

/**
 * Explain an import validation failure without including private record values.
 * @param {unknown} error
 * @returns {string}
 */
function importFailureMessage(error) {
  if (error instanceof SyntaxError)
    return "The file is not valid JSON. Setup accepts JSON data, not TypeScript/JavaScript modules. Convert source files to JSON before importing.";
  if (error instanceof z.ZodError) {
    const location = error.issues[0]?.path.map(String).join(".") || "document";
    return `The JSON was read, but family data is invalid at ${location}. Check the document/tree format and field values.`;
  }
  if (error instanceof FamilyProjectionError) {
    if (error.code === "REPEATED_PERSON")
      return "The selected tree repeats a person ID. Different people need different IDs, and the displayed view cannot contain the same person twice.";
    return "The family data was read, but its selected view is unsupported. Check the viewer limits in docs/family-document.md.";
  }
  return "The family data could not be validated. Check the document/tree format.";
}

/**
 * Build a new validated family from guided empty/import choices without writing until all answers are accepted.
 * @param {string} directory Base directory for a relative import path.
 * @param {Ask} ask
 * @param {Report} info
 * @returns {Promise<FamilyDocument>} Validated empty or imported document.
 */
async function chooseFamily(directory, ask, info) {
  for (;;) {
    const choice =
      (
        await ask(
          "Start with [1] an empty family or [2] an existing JSON file? [1]: ",
        )
      ).trim() || "1";
    if (!["1", "2"].includes(choice)) {
      info("Choose 1 or 2.");
      continue;
    }
    const title =
      (await ask("Family tree title [Arbre familial]: ")).trim() ||
      "Arbre familial";
    if (choice === "1")
      return parseFamilyDocument({
        schemaVersion: 1,
        revision: 0,
        title,
        rootPersonId: null,
        people: [],
        partnerships: [],
      });
    const input = (
      await ask("Path to the JSON file (full document or nested tree): ")
    )
      .trim()
      .replace(/^(["'])(.*)\1$/, "$2");
    let text;
    try {
      if (!input) throw new Error("Missing input");
      text = await readFile(path.resolve(directory, input), "utf8");
    } catch {
      info(
        "The file could not be read. Check that the path names an existing readable file. Absolute Windows paths and paths in quotes are supported. Choose again, or press Ctrl+C to cancel.",
      );
      continue;
    }
    try {
      const document = importFamilyJson(text, { title });
      projectFamilyDocument(document);
      return document;
    } catch (error) {
      info(
        `${importFailureMessage(error)} The original file is unchanged. Choose again, or press Ctrl+C to cancel.`,
      );
    }
  }
}

/**
 * Guide one local checkout through credentials, family initialization and login storage without resetting an installation.
 * @param {SetupOptions} options
 * @returns {Promise<SetupResult>} Locations and outcomes without credential values.
 */
export async function setupProject({
  directory,
  ask,
  info = () => {},
  variables = process.env,
  prepareDatabase = prepareLoginDatabase,
}) {
  directory = path.resolve(directory);
  await checkOverrides(directory, variables);
  await privateDirectory(directory, path.join(directory, ".data"));
  const lockPath = path.join(directory, ".data", "setup.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new SetupError(
        "Another setup is running. If it was interrupted, stop it before removing .data/setup.lock and retrying.",
      );
    throw error;
  }
  try {
    const original = await readOptional(path.join(directory, ".env"));
    let configuration =
      original ??
      (await readFile(path.join(directory, ".env.example"), "utf8"));
    let values = configurationValues(configuration, variables);
    validateSettings(values);
    if (values.OWNER_PASSWORD_HASH && !values.PASSWORD_HASH)
      throw new SetupError(
        "Owner credentials exist without viewing credentials. Repair viewing access explicitly with auth:configure before setup.",
      );
    const familyFile = path.resolve(
      directory,
      values.FAMILY_DATA_FILE || ".data/family.json",
    );
    const exists = await readOptional(familyFile);
    const store = createFileFamilyStore(familyFile);
    let document;
    if (exists !== null) {
      try {
        document = await store.read();
        projectFamilyDocument(document);
      } catch {
        throw new SetupError(
          "Existing family data could not be validated. Setup has preserved it; restore a valid backup or correct it before continuing.",
        );
      }
      info("Existing family data and revision history will be kept.");
    } else {
      privateFamilyPath(directory, familyFile);
      document = await chooseFamily(directory, ask, info);
    }
    if (!values.PASSWORD_HASH) {
      configuration = await configureMissingPassword(
        configuration,
        false,
        ask,
        info,
      );
      values = configurationValues(configuration, variables);
    } else info("Existing viewing credentials will be kept.");
    if (!values.SESSION_SECRET) {
      configuration += `\nSESSION_SECRET="${randomBytes(32).toString("hex")}"\n`;
      values = configurationValues(configuration, variables);
    }
    if (!values.OWNER_PASSWORD_HASH) {
      configuration = await configureMissingPassword(
        configuration,
        true,
        ask,
        info,
      );
    } else info("Existing owner credentials will be kept.");
    values = configurationValues(configuration, variables);
    if (!values.KV_REST_API_URL && !values.DATABASE_URL) {
      configuration += '\nDATABASE_URL="file:./db.sqlite"\n';
      values = configurationValues(configuration, variables);
    }
    validateSettings(values, true);
    if (!values.KV_REST_API_URL) {
      info("Preparing local login storage…");
      await prepareDatabase(directory, values.DATABASE_URL);
    } else
      info(
        "Existing Redis login settings are kept. Setup does not contact or change the hosted store.",
      );
    await saveConfiguration(directory, original, configuration);
    if (exists === null) {
      await privateDirectory(directory, path.dirname(familyFile));
      await store.save(document, null);
      info("Local family initialized at revision 0.");
    }
    return {
      familyFile,
      configurationChanged: configuration !== original,
      familyCreated: exists === null,
      loginStore: values.KV_REST_API_URL ? "redis" : "sqlite",
    };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
