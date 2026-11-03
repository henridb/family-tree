import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { configureAuth } from "./auth-configuration.mjs";

const args = process.argv.slice(2);
if (
  args.some((arg) => !["--save-existing", "--owner"].includes(arg)) ||
  new Set(args).size !== args.length
) {
  throw new Error(
    "Use auth:configure, auth:save-existing, auth:configure-owner, or auth:save-existing-owner.",
  );
}
const owner = args.includes("--owner");
const saveExisting = args.includes("--save-existing");
if (saveExisting && !existsSync(".env")) {
  throw new Error(
    "The .env file must exist before saving the current password.",
  );
}

if (!process.stdin.isTTY) {
  throw new Error(
    "Run this command in an interactive terminal to enter a password privately.",
  );
}

const mutedOutput = new Writable({
  /**
   * Discard readline output so terminal input does not reveal the password.
   * @param {string | Uint8Array} _chunk
   * @param {BufferEncoding} _encoding
   * @param {(error?: Error | null) => void} callback
   * @returns {void}
   */
  write(_chunk, _encoding, callback) {
    callback();
  },
});
const prompt = createInterface({
  input: process.stdin,
  output: mutedOutput,
  terminal: true,
});

try {
  process.stdout.write(
    saveExisting
      ? owner
        ? "Existing owner password: "
        : "Existing password: "
      : owner
        ? "New owner password (at least 6 characters): "
        : "New password (at least 6 characters): ",
  );
  const password = await prompt.question("");
  if (!saveExisting) {
    process.stdout.write("\nConfirm password: ");
    const confirmation = await prompt.question("");
    if (password !== confirmation)
      throw new Error("The passwords do not match.");
  }
  process.stdout.write("\n");

  const configuration = readFileSync(
    existsSync(".env") ? ".env" : ".env.example",
    "utf8",
  );
  writeFileSync(
    ".env",
    configureAuth(configuration, password, { saveExisting, owner }),
    {
      mode: 0o600,
    },
  );
  console.log(
    saveExisting
      ? `Saved the ${owner ? "owner " : ""}password recovery copy in .env. Existing sessions are unchanged.`
      : owner
        ? "Updated OWNER_PASSWORD_HASH and OWNER_PASSWORD_RECOVERY in .env. Viewing credentials and sessions are unchanged; restart the app."
        : "Updated .env, including the password recovery copy. Restart the app; existing sessions will be signed out.",
  );
} finally {
  prompt.close();
}
