import Link from "next/link";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { Page } from "@/components/Page";

/** Any unknown URL: branded, bilingual 404 (detail pages have their own). */
export default async function NotFound() {
  const locale = await getLocale();
  return (
    <Page className="py-24 text-center">
    <div className="mx-auto max-w-3xl">
      <p aria-hidden className="font-wordmark text-7xl font-extrabold italic tracking-[-0.06em] text-ink">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-ink">{t(locale, "notFound.title")}</h1>
      <p className="mt-2 text-muted">{t(locale, "notFound.body")}</p>
      <div className="mt-6 flex justify-center gap-6 text-sm font-medium">
        <Link href="/" className="text-ink underline-offset-4 hover:underline">
          {t(locale, "notFound.home")}
        </Link>
        <Link href="/coffees" className="text-ink underline-offset-4 hover:underline">
          {t(locale, "notFound.coffees")}
        </Link>
      </div>
    </div>
    </Page>
  );
}
