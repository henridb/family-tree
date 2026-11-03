import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const requiresRedis =
  process.env.VERCEL === "1" ||
  !!process.env.KV_REST_API_URL ||
  !!process.env.KV_REST_API_TOKEN;

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    OWNER_PASSWORD_HASH: z
      .string()
      .regex(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/)
      .optional(),
    FAMILY_INSTANCE_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .max(128)
      .optional(),
    FAMILY_DATA_FILE: z.string().min(1).optional(),
    DATABASE_URL: requiresRedis ? z.url().optional() : z.url(),
    KV_REST_API_URL: requiresRedis ? z.url() : z.url().optional(),
    KV_REST_API_TOKEN: requiresRedis
      ? z.string().min(1)
      : z.string().min(1).optional(),
    PASSWORD_HASH: z.string().regex(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/),
    SESSION_SECRET: z.string().min(32),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    OWNER_PASSWORD_HASH: process.env.OWNER_PASSWORD_HASH,
    FAMILY_INSTANCE_ID: process.env.FAMILY_INSTANCE_ID,
    FAMILY_DATA_FILE: process.env.FAMILY_DATA_FILE,
    DATABASE_URL: process.env.DATABASE_URL,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    PASSWORD_HASH: process.env.PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
