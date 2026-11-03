import "server-only";

import { Redis } from "@upstash/redis";

import { env } from "@/env";

// Increment and set expiry together, so concurrent instances share one budget.
// Blocked attempts neither extend the window nor grow the counter indefinitely.
const reserveAttemptScript = `
local attempts = tonumber(redis.call("GET", KEYS[1]) or "0")
if attempts > tonumber(ARGV[2]) then return attempts end
attempts = redis.call("INCR", KEYS[1])
if attempts == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return attempts
`;

let redis: Redis | undefined;

/**
 * Atomically reserve an attempt in the shared fixed-window login budget and
 * return its count.
 *
 * Use Redis when both REST credentials are configured; permit SQLite only
 * outside Vercel when neither credential is set. Blocked attempts do not extend
 * the window or grow the count indefinitely. Propagate backend/configuration
 * failures and avoid write retries that could count an attempt twice.
 */
export async function reserveLoginAttempt(
  windowMs: number,
  maxAttempts: number,
) {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    redis ??= new Redis({
      url: env.KV_REST_API_URL,
      token: env.KV_REST_API_TOKEN,
      // Retrying a write whose response was lost could count an attempt twice.
      retry: { retries: 0 },
      /** Create a fresh five-second timeout for each login-budget Redis request. */
      signal: () => AbortSignal.timeout(5000),
    });
    const attempts = await redis.eval(
      reserveAttemptScript,
      [`family-tree:${process.env.VERCEL_ENV ?? env.NODE_ENV}:login-attempts`],
      [windowMs, maxAttempts],
    );
    if (
      typeof attempts !== "number" ||
      !Number.isSafeInteger(attempts) ||
      attempts < 1
    ) {
      throw new Error("Invalid login-attempt count from Redis.");
    }
    return attempts;
  }

  // Never use a local file on Vercel, even if env validation was skipped.
  if (
    process.env.VERCEL === "1" ||
    env.KV_REST_API_URL ||
    env.KV_REST_API_TOKEN
  ) {
    throw new Error("Login requires both Upstash Redis REST credentials.");
  }

  const { db } = await import("@/server/db");
  const now = Date.now();
  const rows = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginRateLimit" ("id", "attempts", "windowStart")
    VALUES ('family-login', 1, ${now})
    ON CONFLICT("id") DO UPDATE SET
      "attempts" = CASE
        WHEN "windowStart" <= ${now - windowMs} THEN 1
        ELSE MIN("attempts" + 1, ${maxAttempts + 1})
      END,
      "windowStart" = CASE
        WHEN "windowStart" <= ${now - windowMs} THEN ${now}
        ELSE "windowStart"
      END
    RETURNING "attempts"
  `;
  if (!rows[0]) throw new Error("No login-attempt count from SQLite.");
  return Number(rows[0].attempts);
}
