"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, t, type Locale } from "@/lib/i18n/dict";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === "zh-TW" ? "en" : "zh-TW";

  return (
    <button
      type="button"
      aria-label={t(locale, "lang.toggleAria")}
      disabled={pending}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        startTransition(() => router.refresh());
      }}
      className="rounded-full border border-line px-3 py-1 text-sm font-medium text-ink transition hover:border-ink hover:text-ink hover:underline underline-offset-4 disabled:opacity-50"
    >
      {t(locale, "lang.toggle")}
    </button>
  );
}
