import { t, type Locale } from "@/lib/i18n/dict";

const block = "animate-pulse rounded-2xl bg-neutral-200/70";

/** Screen-reader status for a loading page; the grey blocks are decorative. */
function Status({ locale }: { locale: Locale }) {
  return (
    <p role="status" className="sr-only">
      {t(locale, "loading.label")}
    </p>
  );
}

/** Placeholder for a list page (title + a grid of cards). */
export function ListSkeleton({ locale, cards = 6 }: { locale: Locale; cards?: number }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Status locale={locale} />
      <div aria-hidden>
        <div className={`${block} h-9 w-48`} />
        <div className={`${block} mt-3 h-5 w-80 max-w-full`} />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className={`${block} h-64`} />
          ))}
        </div>
      </div>
    </div>
  );
}
