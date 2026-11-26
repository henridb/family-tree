import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { env } from "@/env";
import { localeCookie, resolveLocale } from "./locales";
import type { AppLocale } from "./locales";
import type french from "../../messages/fr";
import type english from "../../messages/en";

const catalogs = {
  "fr-FR": () => import("../../messages/fr").then((module) => module.default),
  "en-US": () => import("../../messages/en").then((module) => module.default),
} satisfies Record<AppLocale, () => Promise<typeof french | typeof english>>;

/** Resolve preferences independently for every request and load only its catalog. */
export default getRequestConfig(async () => {
  const locale = resolveLocale(
    (await cookies()).get(localeCookie)?.value,
    env.DEFAULT_LOCALE,
    env.LANGUAGE_MODE,
  );
  const messages = await catalogs[locale]();
  return { locale, messages, timeZone: "UTC" };
});
