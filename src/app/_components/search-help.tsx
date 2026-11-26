import { useTranslations } from "next-intl";
import { ControlHelp } from "./control-help";

/** Explain semicolon-separated name searches using the shared help tooltip. */
export function SearchHelp() {
  const t = useTranslations("viewer");
  return (
    <ControlHelp label={t("searchHelpLabel")}>{t("searchHelp")}</ControlHelp>
  );
}
