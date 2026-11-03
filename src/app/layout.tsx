import "@/styles/globals.css";
import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Arbre familial",
  description: "Créez et explorez votre arbre familial",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
  manifest: "/site.webmanifest",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

/** Wrap every page in the French document, shared typography and tRPC/query providers. */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geist.variable}`}>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, minimum-scale=1"
      />
      <body className="paper-background flex flex-col justify-center">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
