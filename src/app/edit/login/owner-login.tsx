"use client";

import { LanguageSwitcher } from "../../_components/language-switcher";
import { useErrorMessage } from "@/i18n/error-message";
import { useTranslations } from "next-intl";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";

/**
 * Render the separate owner-password login form and open the editor after
 * successful authentication.
 */
export function OwnerLogin() {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const [password, setPassword] = useState("");
  const login = api.editor.login.useMutation({
    /** Clear the password and load a fresh editor page after the owner cookie is saved. */
    onSuccess: () => {
      setPassword("");
      window.location.replace("/edit");
    },
  });
  return (
    <main className="flex min-h-dvh items-center justify-center bg-amber-50 p-5 text-amber-950">
      <form
        className="w-full max-w-md space-y-5 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (!login.isPending) login.mutate(password);
        }}
      >
        <LanguageSwitcher className="ml-auto w-fit" />
        <h1 className="text-2xl font-semibold">{t("auth.ownerTitle")}</h1>
        <p>{t("auth.ownerIntro")}</p>
        <Label htmlFor="owner-password">{t("auth.ownerPassword")}</Label>
        <Input
          id="owner-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={1024}
          disabled={login.isPending}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? t("auth.connecting") : t("auth.openEditor")}
        </Button>
        {login.error && (
          <p role="alert">{errorMessage(login.error, "auth.failed")}</p>
        )}
        <Link href="/" className="block underline">
          {t("common.back")}
        </Link>
      </form>
    </main>
  );
}
