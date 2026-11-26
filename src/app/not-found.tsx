import { LanguageSwitcher } from "./_components/language-switcher";
import { useTranslations } from "next-intl";
import Link from "next/link";

/** Keep missing pages readable on the paper background in every browser color scheme. */
export default function NotFound() {
  const t = useTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-12 text-center text-amber-950">
      <LanguageSwitcher />
      <p aria-hidden="true" className="text-5xl font-semibold">
        404
      </p>
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="max-w-md">{t("notFound.description")}</p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-amber-950 px-4 py-2 font-medium text-amber-50 hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-950"
      >
        {t("notFound.back")}
      </Link>
    </main>
  );
}
