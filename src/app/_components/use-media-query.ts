"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a browser media query, returning false during server rendering
 * and initial hydration.
 */
export function useMediaQuery(query: string): boolean {
  /** Listen for this media query's changes and return a listener cleanup function. */
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    [query],
  );
  /** Read whether the current browser viewport matches the query. */
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
