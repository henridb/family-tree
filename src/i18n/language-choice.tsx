"use client";

import { createContext, useContext, type ReactNode } from "react";

const LanguageChoiceContext = createContext(true);

/** Share the installation policy without exposing server environment variables. */
export function LanguageChoiceProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <LanguageChoiceContext.Provider value={enabled}>
      {children}
    </LanguageChoiceContext.Provider>
  );
}

/** Whether this installation offers visitors a choice of interface language. */
export function useLanguageChoice() {
  return useContext(LanguageChoiceContext);
}
