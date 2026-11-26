import type { useTranslations } from "next-intl";
import type { AppLocale } from "../../src/i18n/locales";
import type {
  MessageCatalog,
  CompatibleMessageCatalog,
} from "../../src/i18n/catalog";
import type french from "../../messages/fr";

/** Compile-time contracts: unused expect-error directives fail the normal type check. */
export function checkTranslationTypes(
  t: ReturnType<typeof useTranslations<"viewer">>,
) {
  t("outlineTitle");
  t("matches", { count: 2 });
  // @ts-expect-error Unknown message keys must be rejected.
  t("unknownMessage");
  // @ts-expect-error Pluralized messages require their count argument.
  t("matches");
  // @ts-expect-error Counts must be numbers, not strings.
  t("matches", { count: "2" });
  // @ts-expect-error Misspelled argument names must be rejected.
  t("matches", { cout: 2 });
  // @ts-expect-error Messages without arguments do not accept extra arguments.
  t("outlineTitle", { unused: true });
  // @ts-expect-error Unsupported locales must be rejected in application code.
  const unsupported: AppLocale = "de-DE";
  // @ts-expect-error Every locale must supply all message namespaces and keys.
  const missingCatalog: MessageCatalog = {};
  type WrongArguments = Omit<typeof french, "viewer"> & {
    viewer: Omit<typeof french.viewer, "matches"> & {
      matches: "Found {total, number}";
    };
  };
  // @ts-expect-error Translations must retain the source argument names.
  const wrongArguments: CompatibleMessageCatalog<WrongArguments>["viewer"]["matches"] =
    "Found {total, number}";
  void unsupported;
  void missingCatalog;
  void wrongArguments;
}
