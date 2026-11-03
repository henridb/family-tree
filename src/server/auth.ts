import "server-only";

import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { TRPCError } from "@trpc/server";

import { env } from "@/env";
import { reserveLoginAttempt } from "@/server/login-rate-limit";

const sessionLifetime = 7 * 24 * 60 * 60;
const loginWindowMs = 60_000;
const maxLoginAttempts = 20;

type AuthSession = {
  authenticated?: boolean;
  expiresAt?: number;
  credentialVersion?: string;
};

type OwnerSession = AuthSession & { owner?: boolean };

/**
 * Build seven-day, HTTP-only session cookie settings, using Secure __Host-
 * cookies in production.
 */
function sessionOptions(name: string) {
  return {
    password: env.SESSION_SECRET,
    cookieName: env.NODE_ENV === "production" ? `__Host-${name}` : name,
    ttl: sessionLifetime,
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

/** Read the owner cookie into a session object without granting or checking editing access. */
export async function getOwnerSession() {
  return getIronSession<OwnerSession>(
    await cookies(),
    sessionOptions("family-owner-session"),
  );
}

/**
 * Check the owner role, authentication flag, explicit expiry and current owner
 * credential fingerprint.
 *
 * Return false when owner access is disabled or credentials have changed;
 * merely possessing a viewing session cannot satisfy this check.
 */
export function isOwner(session: OwnerSession) {
  return (
    !!env.OWNER_PASSWORD_HASH &&
    session.owner === true &&
    session.authenticated === true &&
    typeof session.expiresAt === "number" &&
    session.expiresAt > Date.now() &&
    session.credentialVersion ===
      createHash("sha256").update(env.OWNER_PASSWORD_HASH).digest("hex")
  );
}

/**
 * Mark and save an owner session with a fresh seven-day expiry and the current
 * owner credential fingerprint.
 *
 * Require configured owner access; callers must verify the password first.
 * Changing the owner hash invalidates this session on later authorization
 * checks.
 */
export async function startOwnerSession(
  session: Awaited<ReturnType<typeof getOwnerSession>>,
) {
  if (!env.OWNER_PASSWORD_HASH)
    throw new Error("Owner access is not configured.");
  session.owner = true;
  session.authenticated = true;
  session.expiresAt = Date.now() + sessionLifetime * 1000;
  session.credentialVersion = createHash("sha256")
    .update(env.OWNER_PASSWORD_HASH)
    .digest("hex");
  await session.save();
}

/**
 * Fingerprint the current viewing password hash so credential changes
 * invalidate older sessions.
 */
function credentialVersion() {
  return createHash("sha256").update(env.PASSWORD_HASH).digest("hex");
}

/** Read the shared viewing cookie into a session object without checking authorization. */
export async function getSession() {
  return getIronSession<AuthSession>(
    await cookies(),
    sessionOptions("family-session"),
  );
}

/**
 * Accept only authenticated, unexpired viewing sessions issued for the current
 * viewing password hash.
 */
export function isAuthenticated(session: AuthSession) {
  return (
    session.authenticated === true &&
    typeof session.expiresAt === "number" &&
    session.expiresAt > Date.now() &&
    session.credentialVersion === credentialVersion()
  );
}

/**
 * Grant viewing access when either the shared viewing session or the owner
 * session is valid.
 */
export function hasViewingAccess(
  session: AuthSession,
  ownerSession: OwnerSession,
) {
  return isAuthenticated(session) || isOwner(ownerSession);
}

/**
 * Save a verified viewer's session with a seven-day expiry and the current
 * credential fingerprint.
 *
 * Callers must verify the password before invoking this function.
 */
export async function startSession(
  session: Awaited<ReturnType<typeof getSession>>,
) {
  session.authenticated = true;
  session.expiresAt = Date.now() + sessionLifetime * 1000;
  session.credentialVersion = credentialVersion();
  await session.save();
}

/**
 * Derive a scrypt key and compare it in constant time with a valid stored hash.
 *
 * Use the configured viewing hash unless an owner hash is supplied. Return
 * false for a mismatch and propagate key-derivation failures; this function
 * does not reserve a login attempt or create a session.
 */
export async function verifyPassword(
  password: string,
  hash: string = env.PASSWORD_HASH,
) {
  const [, salt, expected] = hash.split(":");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt!,
      64,
      {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
  return timingSafeEqual(actual, Buffer.from(expected!, "hex"));
}

/**
 * Reserve a site-wide login attempt before password verification.
 *
 * Both viewing and owner logins share a budget of twenty attempts per minute.
 * Throw TOO_MANY_REQUESTS when exhausted and propagate storage failures rather
 * than bypassing the limit.
 */
export async function checkLoginRateLimit() {
  // Reserve an attempt atomically before the expensive password verification.
  // A site-wide budget avoids trusting spoofable client IP headers.
  const attempts = await reserveLoginAttempt(loginWindowMs, maxLoginAttempts);
  if (attempts > maxLoginAttempts) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Trop de tentatives. Réessayez dans une minute.",
    });
  }
}
