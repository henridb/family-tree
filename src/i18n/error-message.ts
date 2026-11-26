"use client";

import { useTranslations } from "next-intl";
import type { ErrorMessageKey } from "@/server/user-facing-error";

/** Translate cached errors at render time, including after changing languages. */
export function useErrorMessage() {
  const t = useTranslations();
  return (
    error:
      | { data?: { messageKey?: ErrorMessageKey | null } | null }
      | null
      | undefined,
    fallback: "errors.generic" | "auth.failed" = "errors.generic",
  ) =>
    error?.data?.messageKey
      ? t(`errors.${error.data.messageKey}`)
      : t(fallback);
}
