import { loginRouter } from "@/server/api/routers/login";
import { editorRouter } from "@/server/api/routers/editor";
import { personRouter } from "@/server/api/routers/person";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  editor: editorRouter,
  person: personRouter,
  login: loginRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const family = await trpc.person.getTree();
 */
export const createCaller = createCallerFactory(appRouter);
