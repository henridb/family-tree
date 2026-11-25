import type french from "../../messages/fr";
import type english from "../../messages/en";
import type { AppLocale } from "./locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof french | typeof english;
  }
}
