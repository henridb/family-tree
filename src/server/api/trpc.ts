/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, flattenError } from "zod";

import {
  getSession,
  getOwnerSession,
  isOwner,
  hasViewingAccess,
} from "@/server/auth";

/**
 * Read both session cookies and attach the caller's headers to the tRPC request
 * context.
 *
 * HTTP and React Server Component callers share this context; procedures
 * perform their own authorization checks.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const [session, ownerSession] = await Promise.all([
    getSession(),
    getOwnerSession(),
  ]);
  return {
    session,
    ownerSession,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  /**
   * Preserve the tRPC error shape and attach flattened Zod issues when
   * validation caused the failure.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? flattenError(error.cause) : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Measure and log successful procedure execution, adding 100–499 ms of
 * simulated latency in development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/** Require a valid shared viewing or owner session before running a protected procedure. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!hasViewingAccess(ctx.session, ctx.ownerSession)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Connexion requise.",
    });
  }
  return next({ ctx });
});

/** Require a valid owner session before allowing editor data access or mutations. */
export const ownerProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isOwner(ctx.ownerSession))
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Accès propriétaire requis.",
    });
  return next({ ctx });
});
