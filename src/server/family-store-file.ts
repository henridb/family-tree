import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parseFamilyDocument } from "../lib/family-document.ts";
import { FamilyStore } from "./family-store.ts";

/**
 * Create a local file store supporting both plain document exports and the
 * versioned history envelope.
 *
 * The first save upgrades a plain document. Writes acquire an exclusive sibling
 * lock, compare the current contents and atomically rename a temporary
 * replacement. Another writer's lock is never removed; a forcibly stopped
 * writer may require manual lock cleanup. Construction performs no file
 * operations.
 */
export function createFileFamilyStore(file: string): FamilyStore {
  /**
   * Read raw stored state, wrapping a valid plain document in an empty-history
   * envelope.
   *
   * Return null only for a missing file. Leave malformed content intact for the
   * store's validation to reject; propagate other file errors.
   */
  async function read() {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === "object" &&
        value !== null &&
        "schemaVersion" in value
      )
        return JSON.stringify({
          formatVersion: 1,
          current: parseFamilyDocument(value),
          history: [],
        });
    } catch {
      // The store validates malformed data; it must never become an empty family.
    }
    return raw;
  }
  return new FamilyStore({
    read,
    /**
     * Replace the file only if its normalized contents still equal the expected
     * value under an exclusive lock.
     *
     * Return false for a competing lock or changed contents. Release this
     * writer's lock and temporary file on exit; propagate I/O failures, which
     * may occur after the replacement has succeeded.
     */
    compareAndSet: async (expected, replacement) => {
      await mkdir(path.dirname(file), { recursive: true });
      const lockPath = `${file}.lock`;
      let lock;
      try {
        lock = await open(lockPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw error;
      }
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        if ((await read()) !== expected) return false;
        await writeFile(temporary, replacement, { flag: "wx", mode: 0o600 });
        await rename(temporary, file);
        return true;
      } finally {
        try {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        } finally {
          await lock.close();
          await unlink(lockPath);
        }
      }
    },
  });
}
