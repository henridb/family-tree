"use client";

import { useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { locales, localeNames } from "@/i18n/locales";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Switch language without replacing the editor or viewer's local state. */
export function LanguageSwitcher() {
  const id = useId();
  const locale = useLocale();
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-1" data-language-switcher>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{t("label")}</Label>
        <Select
          value={locale}
          disabled={pending}
          onValueChange={(value) => {
            setFailed(false);
            startTransition(async () => {
              try {
                setFailed(!(await setLocale(value)));
              } catch {
                setFailed(true);
              }
            });
          }}
        >
          <SelectTrigger
            id={id}
            aria-busy={pending}
            className="h-8 w-32 border-amber-900/20 bg-white/60"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-amber-900/20 bg-amber-50 text-amber-950">
            {locales.map((value) => (
              <SelectItem key={value} value={value}>
                {localeNames[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-red-900">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
