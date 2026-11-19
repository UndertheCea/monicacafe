"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useTransition } from "react";
import { LOCALE_COOKIE, t, type Locale } from "@/lib/i18n/dict";
import { localeCookieString, nextWithSearch } from "@/lib/i18n/localeForm";
import { Button } from "@/components/ui";

// A form so it works without JavaScript too (#367): it posts to /api/locale,
// which sets the cookie and redirects back. With JavaScript, onSubmit swaps the
// cookie in place and refreshes, as before.
//
// `next` keeps the query string (#412). useSearchParams needs a Suspense boundary
// so it doesn't push static pages into client rendering; the fallback is the same
// form with the bare path (static pages have no query to keep).
//
// `returnTo` overrides both (#416): /menu passes the page it was opened from.
export function LanguageToggle({ locale, returnTo }: { locale: Locale; returnTo?: string | null }) {
  const pathname = usePathname();
  if (returnTo) return <LanguageForm locale={locale} nextUrl={returnTo} />;
  return (
    <Suspense fallback={<LanguageForm locale={locale} nextUrl={pathname} />}>
      <WithSearch locale={locale} pathname={pathname} />
    </Suspense>
  );
}

function WithSearch({ locale, pathname }: { locale: Locale; pathname: string }) {
  const search = useSearchParams().toString();
  return <LanguageForm locale={locale} nextUrl={nextWithSearch(pathname, search)} />;
}

function LanguageForm({ locale, nextUrl }: { locale: Locale; nextUrl: string }) {
  const router = useRouter();
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
      <input type="hidden" name="next" value={nextUrl} />
      <Button type="submit" aria-label={t(locale, "lang.toggleAria")} disabled={pending} variant="secondary">
        <span lang={next === "en" ? "en" : "zh-Hant"}>{t(locale, "lang.toggle")}</span>
      </Button>
    </form>
  );
}
