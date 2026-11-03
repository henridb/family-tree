"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import SuperJSON from "superjson";

import { type AppRouter } from "@/server/api/root";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
/** Reuse one browser query cache while creating a fresh cache for each server call. */
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  clientQueryClientSingleton ??= createQueryClient();

  return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Provide the browser tRPC client and shared query cache to descendants.
 *
 * Batch requests without streaming so session mutations can set cookies before
 * response headers are sent. Log operation metadata rather than credentials or
 * returned family data.
 */
export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          // Log operation names only; never log credentials or returned family data.
          /**
           * Log operation direction, type and path, excluding the shared-login
           * endpoint and all payloads.
           */
          logger: ({ direction, path, type }) => {
            if (path !== "login.login") {
              console.debug(`[tRPC] ${direction} ${type} ${path}`);
            }
          },
          /**
           * Enable metadata logging in development and for failed downstream
           * responses elsewhere.
           */
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        // Session mutations must finish setting cookies before headers are sent.
        httpBatchLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          /** Identify browser-originated tRPC requests with the nextjs-react source header. */
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

/** Choose the current browser origin, Vercel deployment URL or local server address. */
function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
