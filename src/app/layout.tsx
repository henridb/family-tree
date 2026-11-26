import "@/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { TRPCReactProvider } from "@/trpc/react";
import { LanguageChoiceProvider } from "@/i18n/language-choice";
import { env } from "@/env";

/** Keep document metadata in the same language as the rendered interface. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
    icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
    manifest: "/site.webmanifest",
  };
}

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

/** Provide request-specific translations without keying or remounting application state. */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${geist.variable}`}>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, minimum-scale=1"
      />
      <body className="paper-background flex flex-col justify-center">
        <NextIntlClientProvider>
          <LanguageChoiceProvider enabled={env.LANGUAGE_MODE === "choice"}>
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </LanguageChoiceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
