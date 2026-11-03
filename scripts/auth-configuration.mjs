import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { parseEnv } from "node:util";

/**
 * @typedef {object} AuthConfigurationOptions
 * @property {boolean} [saveExisting=false] Verify an existing password and update only its recovery copy.
 * @property {boolean} [owner=false] Configure owner credentials instead of shared viewing credentials.
 */

/**
 * Derive the 64-byte scrypt key used by application password hashes.
 * @param {string} password
 * @param {string} salt Hexadecimal salt stored with the password hash.
 * @returns {Buffer}
 */
function derivePassword(password, salt) {
  return scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

/**
 * Return updated dotenv text for the viewing or owner password without writing
 * a file.
 *
 * New viewing credentials also replace the session secret. New owner
 * credentials preserve viewing access and must use a different password. With
 * `saveExisting`, verify the selected existing hash and update only its
 * recovery copy, preserving hashes and sessions. Recovery is reversible
 * encoding, not encryption.
 *
 * Reject invalid passwords or configuration before returning any changes;
 * preserve unrelated entries and the existing newline style.
 *
 * @param {string} configuration Existing dotenv contents.
 * @param {string} password Plaintext supplied privately by the caller.
 * @param {AuthConfigurationOptions} [options]
 * @returns {string} Updated dotenv contents, ready for private storage.
 */
export function configureAuth(
  configuration,
  password,
  { saveExisting = false, owner = false } = {},
) {
  const prefix = owner ? "OWNER_PASSWORD" : "PASSWORD";
  const hashKey = `${prefix}_HASH`;
  if (saveExisting) {
    const storedHash = parseEnv(configuration)[hashKey];
    if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(storedHash ?? "")) {
      throw new Error(`The .env file must contain a valid ${hashKey}.`);
    }
    const [, salt, expected] = storedHash.split(":");
    if (
      password.length < 1 ||
      password.length > 1024 ||
      !timingSafeEqual(
        derivePassword(password, salt),
        Buffer.from(expected, "hex"),
      )
    ) {
      throw new Error(
        "The password does not match the existing password hash.",
      );
    }
  } else if (password.length < 6 || password.length > 1024) {
    throw new Error("Use a password between 6 and 1024 characters.");
  }

  if (owner && !saveExisting) {
    const storedHash = parseEnv(configuration).PASSWORD_HASH;
    if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(storedHash ?? ""))
      throw new Error(
        "Configure viewing access first with npm run auth:configure.",
      );
    const [, salt, expected] = storedHash.split(":");
    if (
      timingSafeEqual(
        derivePassword(password, salt),
        Buffer.from(expected, "hex"),
      )
    )
      throw new Error(
        "The owner password must differ from the shared viewing password.",
      );
  }

  // Single-quoted JSON survives dotenv quoting and Next.js variable expansion.
  // Escape the enclosing quote, dollar references, and Unicode line separators.
  const recovery = JSON.stringify(password).replace(
    /['$\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const entries = { [`${prefix}_RECOVERY`]: `'${recovery}'` };
  if (!saveExisting) {
    const salt = randomBytes(16).toString("hex");
    entries[hashKey] =
      `"scrypt:${salt}:${derivePassword(password, salt).toString("hex")}"`;
    if (!owner) entries.SESSION_SECRET = `"${randomBytes(32).toString("hex")}"`;
  }

  const newline = configuration.includes("\r\n") ? "\r\n" : "\n";
  for (const [name, value] of Object.entries(entries)) {
    const entry = `${name}=${value}`;
    const pattern = new RegExp(
      `^[\\t ]*(?:export[\\t ]+)?${name}[\\t ]*=.*$`,
      "gm",
    );
    configuration = pattern.test(configuration)
      ? configuration.replace(pattern, () => entry)
      : `${configuration}${configuration && !configuration.endsWith("\n") ? newline : ""}${entry}${newline}`;
  }
  return configuration;
}
