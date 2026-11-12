"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, t, type Locale } from "@/lib/i18n/dict";
import { Button } from "@/components/ui";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === "zh-TW" ? "en" : "zh-TW";

  return (
    <Button
      type="button"
      aria-label={t(locale, "lang.toggleAria")}
      disabled={pending}
      onClick={() => {
          document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
          startTransition(() => router.refresh());
        }}
      variant="secondary"
    >
      <span lang={next === "en" ? "en" : "zh-Hant"}>{t(locale, "lang.toggle")}</span>
    </Button>
  );
}
