import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/** Build the tRPC context from the incoming HTTP request's headers and session cookies. */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

/**
 * Handle tRPC GET/POST requests with same-origin enforcement for mutations and
 * uncached responses.
 *
 * Compare POST Origin with the request protocol and Host before dispatch, so
 * cookie authentication alone cannot authorize a cross-origin mutation. Enable
 * detailed adapter error logging only in development.
 */
const handler = async (req: NextRequest) => {
  // Cookies authenticate requests; verify the browser origin before mutations.
  // Next normalizes loopback URLs, so retain the actual Host header here.
  const expectedOrigin = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  if (req.method === "POST" && req.headers.get("origin") !== expectedOrigin) {
    return new Response("Origine non autorisée.", { status: 403 });
  }

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    /** Create the context for this HTTP request when the tRPC adapter dispatches it. */
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export { handler as GET, handler as POST };
