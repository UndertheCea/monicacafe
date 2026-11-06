import { SORT_PARAMS, type SortParam } from "@/lib/coffeeQuery";
import { t, type Locale } from "@/lib/i18n/dict";

/** Sort for a shop's coffees: a plain GET form (works without JavaScript); submitting resets to page 1. */
export function ShopSortForm({ locale, sort, action }: { locale: Locale; sort: SortParam; action: string }) {
  return (
    <form method="get" action={action} className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-stone-500">{t(locale, "sort.label")}</span>
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-stone-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {SORT_PARAMS.map((p) => (
            <option key={p || "newest"} value={p}>
              {t(locale, `sort.${p || "newest"}`)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-full border border-stone-300 px-3 py-1.5 hover:border-stone-500">
        {t(locale, "sort.apply")}
      </button>
    </form>
  );
}
