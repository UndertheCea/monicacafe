import Link from "next/link";
import { t } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

/** Any unknown URL: branded, bilingual 404 (detail pages have their own). */
export default async function NotFound() {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p aria-hidden className="text-5xl">
        ☕
      </p>
      <h1 className="mt-4 text-2xl font-bold text-stone-900">{t(locale, "notFound.title")}</h1>
      <p className="mt-2 text-stone-600">{t(locale, "notFound.body")}</p>
      <div className="mt-6 flex justify-center gap-6 text-sm font-medium">
        <Link href="/" className="text-amber-700 hover:underline">
          {t(locale, "notFound.home")}
        </Link>
        <Link href="/coffees" className="text-amber-700 hover:underline">
          {t(locale, "notFound.coffees")}
        </Link>
      </div>
    </div>
  );
}
