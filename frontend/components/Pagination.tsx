import { pageHref, type SearchParams } from "@/lib/coffeeFilters";
import { t, type Locale } from "@/lib/i18n/dict";
import { LinkPending } from "./LinkPending";
import { Button } from "@/components/ui";
import { pagerShortcuts } from "@/lib/pagination";

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
  const { first, last } = pagerShortcuts(page, pages);
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm" aria-label={t(locale, "page.nav")}>
      {first ? (
        <Button href={href(first)} variant="quiet">
          {t(locale, "page.first")}
        </Button>
      ) : null}
      {page > 1 ? (
        <Button href={href(page - 1)} variant="secondary">
          {t(locale, "page.prev")}
          <LinkPending />
        </Button>
      ) : null}
      <span className="text-muted">{t(locale, "page.of", { page, pages })}</span>
      {page < pages ? (
        <Button href={href(page + 1)} variant="secondary">
          {t(locale, "page.next")}
          <LinkPending />
        </Button>
      ) : null}
      {last ? (
        <Button href={href(last)} variant="quiet">
          {t(locale, "page.last")}
        </Button>
      ) : null}
    </nav>
  );
}
