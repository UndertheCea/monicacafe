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
      className="rounded-full border border-stone-300 px-3 py-1 text-sm font-medium text-stone-700 transition hover:border-amber-500 hover:text-amber-700 disabled:opacity-50"
    >
      {t(locale, "lang.toggle")}
    </button>
  );
}
