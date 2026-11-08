import { ROAST_LEVELS, SEARCH_MAX_CHARS, SORT_PARAMS, type RoastLevel, type SortParam } from "@/lib/coffeeQuery";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { SHOP_SORT_PARAMS, type ShopSortParam } from "@/lib/shopQuery";

const fieldCls =
  "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-neutral-800 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

/**
 * Search, roast and sort for one shop's coffees: a plain GET form (works
 * without JavaScript); submitting keeps all three and resets to page 1.
 */
export function ShopCoffeesForm({
  locale,
  action,
  sort,
  q,
  roast,
}: {
  locale: Locale;
  action: string;
  sort: SortParam;
  q?: string;
  roast?: RoastLevel;
}) {
  return (
    <SortForm
      locale={locale}
      action={action}
      value={sort}
      options={SORT_PARAMS.map((p) => ({ value: p, label: t(locale, `sort.${p || "newest"}`) }))}
      submit="filter.apply"
    >
      <SearchField locale={locale} q={q} label="shops.searchCoffees" placeholder="shops.searchCoffeesPlaceholder" />
      <label className="flex items-center gap-2">
        <span className="text-neutral-500">{t(locale, "filter.roast")}</span>
        <select name="roast" defaultValue={roast ?? ""} className={fieldCls}>
          <option value="">{t(locale, "filter.any")}</option>
          {ROAST_LEVELS.map((r) => (
            <option key={r} value={r}>
              {t(locale, `roast.${r}`)}
            </option>
          ))}
        </select>
      </label>
    </SortForm>
  );
}

/** Search + sort for the /shops list (newest / name / most coffees). */
export function ShopListSortForm({ locale, sort, q }: { locale: Locale; sort: ShopSortParam; q?: string }) {
  return (
    <SortForm
      locale={locale}
      action="/shops"
      value={sort}
      options={SHOP_SORT_PARAMS.map((p) => ({ value: p, label: t(locale, `shopSort.${p || "newest"}`) }))}
      submit="filter.search"
    >
      <SearchField locale={locale} q={q} label="shops.search" placeholder="shops.searchPlaceholder" />
    </SortForm>
  );
}

/** A keyword box (`?q=`) for a GET form, capped at what the API accepts. */
export function SearchField({
  locale,
  q,
  label,
  placeholder,
}: {
  locale: Locale;
  q?: string;
  label: MessageKey;
  placeholder: MessageKey;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t(locale, label)}</span>
      <input
        type="search"
        name="q"
        defaultValue={q ?? ""}
        placeholder={t(locale, placeholder)}
        maxLength={SEARCH_MAX_CHARS}
        className={`${fieldCls} w-44 sm:w-56`}
      />
    </label>
  );
}

/**
 * A GET form with optional extra fields (search, filters) before the sort
 * select; every field lands in the URL, so a submit keeps them together and
 * resets to page 1.
 */
export function SortForm({
  locale,
  action,
  value,
  options,
  children,
  submit = "sort.apply",
}: {
  locale: Locale;
  action: string;
  value: string;
  options: { value: string; label: string }[];
  children?: React.ReactNode;
  /** Button label: "Sort" alone, "Search" / "Apply" once there are other fields. */
  submit?: MessageKey;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-center gap-2 text-sm">
      {children}
      <label className="flex items-center gap-2">
        <span className="text-neutral-500">{t(locale, "sort.label")}</span>
        <select name="sort" defaultValue={value} className={fieldCls}>
          {options.map((o) => (
            <option key={o.value || "newest"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-full border border-neutral-300 px-3 py-1.5 hover:border-neutral-500">
        {t(locale, submit)}
      </button>
    </form>
  );
}
