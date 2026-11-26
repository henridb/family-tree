import { LanguageSwitcher } from "../../_components/language-switcher";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { env } from "@/env";
import { getOwnerSession, isOwner } from "@/server/auth";
import { OwnerLogin } from "./owner-login";

/**
 * Redirect valid owners to the editor, otherwise show owner login or explain
 * that editing is not configured.
 */
export default async function OwnerLoginPage() {
  const t = await getTranslations();
  if (isOwner(await getOwnerSession())) redirect("/edit");
  if (!env.OWNER_PASSWORD_HASH)
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8">
        <LanguageSwitcher className="ml-auto w-fit" />
        <h1 className="text-xl font-semibold">{t("auth.disabledTitle")}</h1>
        <p className="mt-4">{t("auth.disabledIntro")}</p>
        <Link className="mt-4 inline-block underline" href="/">
          {t("common.back")}
        </Link>
      </main>
    );
  return <OwnerLogin />;
}
