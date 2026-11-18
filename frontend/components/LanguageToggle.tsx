"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, t, type Locale } from "@/lib/i18n/dict";
import { localeCookieString } from "@/lib/i18n/localeForm";
import { Button } from "@/components/ui";

// A form so it works without JavaScript too (#367): it posts to /api/locale,
// which sets the cookie and redirects back. With JavaScript, onSubmit swaps the
// cookie in place and refreshes, as before.
export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === "zh-TW" ? "en" : "zh-TW";

  return (
    <form
      method="post"
      action="/api/locale"
      onSubmit={(e) => {
        e.preventDefault();
        document.cookie = localeCookieString(LOCALE_COOKIE, next);
        startTransition(() => router.refresh());
      }}
    >
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="next" value={pathname} />
      <Button type="submit" aria-label={t(locale, "lang.toggleAria")} disabled={pending} variant="secondary">
        <span lang={next === "en" ? "en" : "zh-Hant"}>{t(locale, "lang.toggle")}</span>
      </Button>
    </form>
  );
}
