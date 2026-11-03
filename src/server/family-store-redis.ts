import "server-only";

import { Redis } from "@upstash/redis";
import { z } from "zod";

import { FamilyStore, type FamilyStoreBackend } from "./family-store.ts";

// No JSON parsing or multiple writes in Lua: the complete state, including
// history, is validated in the application and replaced with one Redis SET.
const compareAndSetScript = `
local current = redis.call("GET", KEYS[1])
if ARGV[1] == "missing" then
  if current then return 0 end
elseif current ~= ARGV[2] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[3])
return 1
`;

const scopeSchema = z.strictObject({
  environment: z.enum(["production", "preview", "development"]),
  instanceId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(128),
});

export type FamilyStoreScope = z.infer<typeof scopeSchema>;

/** Validate an environment/instance scope and build its isolated Redis family key. */
export function familyStorageKey(scope: FamilyStoreScope): string {
  const { environment, instanceId } = scopeSchema.parse(scope);
  return `family-tree:${environment}:family:${instanceId}`;
}

type RedisFamilyStoreOptions = FamilyStoreScope & {
  url: string;
  token: string;
};

/**
 * Create a Redis family store with atomic comparison/replacement of the entire
 * document and history.
 *
 * Validate the scope and REST credentials without contacting Redis or creating
 * keys. Requests use raw JSON, a five-second timeout and no automatic retry;
 * saves set no expiry. Failures with an uncertain write outcome must be checked
 * by reading before retrying.
 */
export function createRedisFamilyStore(
  options: RedisFamilyStoreOptions,
): FamilyStore {
  const key = familyStorageKey({
    environment: options.environment,
    instanceId: options.instanceId,
  });
  const redis = new Redis({
    url: z.url().parse(options.url),
    token: z.string().min(1).parse(options.token),
    automaticDeserialization: false,
    enableAutoPipelining: false,
    retry: { retries: 0 },
    /** Create a fresh five-second timeout for each Redis request. */
    signal: () => AbortSignal.timeout(5000),
  });
  const backend: FamilyStoreBackend = {
    /**
     * Fetch the raw JSON string, accepting null for a missing key and rejecting
     * unexpected response types.
     */
    read: async () => {
      const result: unknown = await redis.get(key);
      if (result !== null && typeof result !== "string") {
        throw new Error("Invalid family storage response.");
      }
      return result;
    },
    /**
     * Run the single-key Lua comparison and replacement, accepting only a
     * zero/one acknowledgement.
     */
    compareAndSet: async (expected, replacement) => {
      const result: unknown = await redis.eval(
        compareAndSetScript,
        [key],
        [
          expected === null ? "missing" : "present",
          expected ?? "",
          replacement,
        ],
      );
      if (result !== 0 && result !== 1) {
        throw new Error("Invalid family save response.");
      }
      return result === 1;
    },
  };
  return new FamilyStore(backend);
}
