import Link from "next/link";
import { pageHref, type SearchParams } from "@/lib/coffeeFilters";
import { t, type Locale } from "@/lib/i18n/dict";

const btn = "rounded-full border border-neutral-300 px-4 py-2 hover:border-neutral-500";

/** Prev / "page X of Y" / next links that preserve the current query string. */
export function Pagination({
  locale,
  sp,
  page,
  pages,
  base,
  hrefFor,
}: {
  locale: Locale;
  sp: SearchParams;
  page: number;
  pages: number;
  base: string;
  /** Builds a page's link instead of `pageHref(sp, page, base)` (pages with two paged lists). */
  hrefFor?: (page: number) => string;
}) {
  const href = (p: number) => (hrefFor ? hrefFor(p) : pageHref(sp, p, base));
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label={t(locale, "page.nav")}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={btn}>
          {t(locale, "page.prev")}
        </Link>
      ) : null}
      <span className="text-neutral-500">{t(locale, "page.of", { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={btn}>
          {t(locale, "page.next")}
        </Link>
      ) : null}
    </nav>
  );
}
