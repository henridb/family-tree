import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

/**
 * Create a query cache with thirty-second freshness and SuperJSON hydration.
 *
 * Include pending queries in dehydration so server-rendered requests can
 * continue through client hydration.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        /** Include queries selected by the default policy as well as requests still pending. */
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
