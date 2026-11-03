import "server-only";

import { z } from "zod";

import {
  familyDocumentSchema,
  parseFamilyDocument,
  type FamilyDocument,
} from "../lib/family-document.ts";
import {
  exportFamilyJson,
  importFamilyJson,
  type FamilyJsonOptions,
} from "../lib/family-json.ts";

export const familyHistoryLimit = 10;

/** A backend must compare and replace one complete value atomically. */
export type FamilyStoreBackend = {
  /** Return raw stored JSON, or null only when no value exists; throw on read failure. */
  read: () => Promise<string | null>;
  /**
   * Atomically replace an exact raw value, using null for create-only writes.
   * Return false for a mismatch and throw on failure, including an uncertain
   * write outcome; callers must not blindly retry.
   */
  compareAndSet: (
    expected: string | null,
    replacement: string,
  ) => Promise<boolean>;
};

const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stateSchema = z
  .strictObject({
    formatVersion: z.literal(1),
    current: familyDocumentSchema,
    history: z.array(familyDocumentSchema).max(familyHistoryLimit),
  })
  .superRefine(({ current, history }, ctx) => {
    history.forEach((document, index) => {
      if (document.revision !== current.revision - index - 1) {
        ctx.addIssue({
          code: "custom",
          path: ["history", index, "revision"],
          message:
            "Stored history must contain consecutive previous revisions.",
        });
      }
    });
  });

type StoredFamily = z.infer<typeof stateSchema>;
type LoadedFamily = { raw: string | null; state: StoredFamily | null };

export class FamilyStoreConflictError extends Error {
  /**
   * Create a conflict error indicating that the editor's expected version is no
   * longer current.
   */
  constructor() {
    super("The family changed. Reload it before saving again.");
    this.name = "FamilyStoreConflictError";
  }
}

type StoreErrorCode =
  | "UNAVAILABLE"
  | "INVALID_STORED_DATA"
  | "NOT_INITIALIZED"
  | "REVISION_NOT_FOUND"
  | "REVISION_EXHAUSTED";

export class FamilyStoreError extends Error {
  readonly code: StoreErrorCode;

  /** Create a storage error with a stable code and an optional underlying cause. */
  constructor(code: StoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FamilyStoreError";
    this.code = code;
  }
}

/** Storage only: callers own authorization and selected-view compatibility. */
export class FamilyStore {
  private readonly backend: FamilyStoreBackend;

  /**
   * Attach a backend providing raw reads and atomic comparison/replacement
   * without accessing it yet.
   */
  constructor(backend: FamilyStoreBackend) {
    this.backend = backend;
  }

  /**
   * Read and validate one storage envelope, retaining its raw text for a later
   * atomic comparison.
   *
   * Distinguish an uninitialized store from unavailable or corrupt storage;
   * never treat a failed read or validation as an empty family.
   */
  private async load(): Promise<LoadedFamily> {
    let raw: string | null;
    try {
      raw = await this.backend.read();
    } catch (cause) {
      throw new FamilyStoreError(
        "UNAVAILABLE",
        "Family storage is unavailable.",
        {
          cause,
        },
      );
    }
    if (raw === null) return { raw, state: null };
    try {
      if (typeof raw !== "string")
        throw new Error("Expected stored JSON text.");
      const value: unknown = JSON.parse(raw);
      return { raw, state: stateSchema.parse(value) };
    } catch (cause) {
      throw new FamilyStoreError(
        "INVALID_STORED_DATA",
        "Stored family data is invalid; it has not been replaced.",
        { cause },
      );
    }
  }

  /**
   * Return a newly parsed current document, or null when the store has not been
   * initialized.
   */
  async read(): Promise<FamilyDocument | null> {
    return (await this.load()).state?.current ?? null;
  }

  /** Return newly parsed previous documents, newest first, excluding the current revision. */
  async history(): Promise<FamilyDocument[]> {
    return (await this.load()).state?.history ?? [];
  }

  /** Return the current document and retained history from one consistent storage read. */
  async snapshot() {
    const { state } = await this.load();
    return { document: state?.current ?? null, history: state?.history ?? [] };
  }

  /**
   * Atomically replace a loaded snapshot with a new revision and bounded
   * recovery history.
   *
   * Require the expected revision to match and the backend's raw value to
   * remain unchanged. Assign revisions locally instead of trusting imported
   * counters. Reject counter exhaustion, report conflicts, and wrap write
   * failures without retrying an uncertain save. Callers supply
   * already-validated, independently owned records.
   */
  private async commit(
    document: FamilyDocument,
    expectedRevision: number | null,
    loaded: LoadedFamily,
  ): Promise<FamilyDocument> {
    const current = loaded.state?.current;
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new FamilyStoreConflictError();
    }
    if (current?.revision === Number.MAX_SAFE_INTEGER) {
      throw new FamilyStoreError(
        "REVISION_EXHAUSTED",
        "The family revision counter is exhausted.",
      );
    }
    // Revision numbers belong to this store, not to an imported backup.
    const saved: FamilyDocument = {
      ...document,
      revision: current ? current.revision + 1 : 0,
    };
    const replacement: StoredFamily = {
      formatVersion: 1,
      current: saved,
      history: loaded.state
        ? [loaded.state.current, ...loaded.state.history].slice(
            0,
            familyHistoryLimit,
          )
        : [],
    };
    let committed: boolean;
    try {
      committed = await this.backend.compareAndSet(
        loaded.raw,
        JSON.stringify(replacement),
      );
    } catch (cause) {
      throw new FamilyStoreError(
        "UNAVAILABLE",
        "The save could not be confirmed. Reload the family before retrying.",
        { cause },
      );
    }
    if (!committed) throw new FamilyStoreConflictError();
    return saved;
  }

  /**
   * Validate and copy a complete document, then save it only against the
   * expected current revision.
   *
   * Pass null for create-only initialization; an existing document requires the
   * revision originally edited. The destination assigns the new revision and
   * retains up to ten previous versions. Conflicts and storage failures leave
   * the caller responsible for reloading before another save.
   */
  async save(
    value: unknown,
    expectedRevision: number | null,
  ): Promise<FamilyDocument> {
    const document = parseFamilyDocument(value);
    revisionSchema.nullable().parse(expectedRevision);
    return this.commit(document, expectedRevision, await this.load());
  }

  /**
   * Read and export the current document in the requested format; throw
   * NOT_INITIALIZED if none exists.
   */
  async exportJson(options?: FamilyJsonOptions): Promise<string> {
    const document = await this.read();
    if (!document) {
      throw new FamilyStoreError(
        "NOT_INITIALIZED",
        "No family has been saved.",
      );
    }
    return exportFamilyJson(document, options);
  }

  /**
   * Validate JSON and save its document using the destination's expected
   * revision and history rules.
   *
   * Detection and conversion happen before storage access; the destination
   * assigns the saved revision regardless of the imported counter.
   */
  async importJson(
    text: string,
    expectedRevision: number | null,
    options?: FamilyJsonOptions,
  ): Promise<FamilyDocument> {
    return this.save(importFamilyJson(text, options), expectedRevision);
  }

  /**
   * Restore a retained historical document as a new revision without rewinding
   * the counter.
   *
   * Require the expected current revision and preserve the replaced document in
   * history. Throw for an uninitialized store, a stale revision or a version no
   * longer retained. Viewer compatibility is the caller's responsibility.
   */
  async restore(
    revision: number,
    expectedRevision: number,
  ): Promise<FamilyDocument> {
    revisionSchema.parse(revision);
    revisionSchema.parse(expectedRevision);
    const loaded = await this.load();
    if (!loaded.state) {
      throw new FamilyStoreError(
        "NOT_INITIALIZED",
        "No family has been saved.",
      );
    }
    if (loaded.state.current.revision !== expectedRevision) {
      throw new FamilyStoreConflictError();
    }
    const document = loaded.state.history.find(
      (value) => value.revision === revision,
    );
    if (!document) {
      throw new FamilyStoreError(
        "REVISION_NOT_FOUND",
        "That previous revision is not retained in this store.",
      );
    }
    return this.commit(document, expectedRevision, loaded);
  }
}
