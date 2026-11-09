import Link from "next/link";
import {
  type CoffeeFilter,
  type CoffeeVariety,
  type Counted,
  type OriginCountry,
  type ProcessingMethod,
} from "@/lib/api";
import { SEARCH_MAX_CHARS, SORT_PARAMS, type SortParam } from "@/lib/coffeeQuery";
import { groupByRegion, optionsWithCoffees } from "@/lib/filterOptions";
import { pick, t, type Locale } from "@/lib/i18n/dict";

interface Props {
  locale: Locale;
  filter: CoffeeFilter;
  sort: SortParam;
  origins: Counted<OriginCountry>[];
  varieties: Counted<CoffeeVariety>[];
  methods: Counted<ProcessingMethod>[];
}

const fieldCls =
  "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-neutral-500";

// Plain GET form: works without JavaScript and keeps filters in the URL.
// Only origin / variety / process / price / in stock (owner, #166): each shop
// rates cup profile, roast and brew by its own standard, so those aren't
// compared across shops here.
export function FilterSidebar({ locale, filter, sort, origins, varieties, methods }: Props) {
  // Only values with published coffees (plus whatever the URL selects), with
  // their counts; origins in an <optgroup> per continent.
  const regions = groupByRegion(optionsWithCoffees(origins, filter.originCountryId));
  const shownVarieties = optionsWithCoffees(varieties, filter.varietyId);
  const shownMethods = optionsWithCoffees(methods, filter.processingMethodId);
  const counted = (name: string, n: number) => t(locale, "filter.optionCount", { name, n });

  return (
    <form method="get" action="/coffees" className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 group-open:p-0 group-open:shadow-none group-open:ring-0">
      {/* Below md the drawer (or the no-JS toggle) already says "Filters". */}
      <h2 className="hidden text-base font-bold text-ink md:block">{t(locale, "filter.title")}</h2>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={filter.search ?? ""}
          placeholder={t(locale, "filter.searchPlaceholder")}
          maxLength={SEARCH_MAX_CHARS}
          className={fieldCls}
        />
      </label>

      <label className="block">
        <span className={labelCls}>{t(locale, "sort.label")}</span>
        <select name="sort" defaultValue={sort} className={fieldCls}>
          {SORT_PARAMS.map((p) => (
            <option key={p || "newest"} value={p}>
              {t(locale, `sort.${p || "newest"}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.origin")}</span>
        <select name="origin" defaultValue={filter.originCountryId ?? ""} className={fieldCls}>
          <option value="">{t(locale, "filter.any")}</option>
          {regions.map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {counted(pick(locale, `${o.nameZh} ${o.nameEn}`, o.nameEn), o.coffeeCount)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.variety")}</span>
        <select name="variety" defaultValue={filter.varietyId ?? ""} className={fieldCls}>
          <option value="">{t(locale, "filter.any")}</option>
          {shownVarieties.map((v) => (
            <option key={v.id} value={v.id}>
              {counted(v.name, v.coffeeCount)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.process")}</span>
        <select name="process" defaultValue={filter.processingMethodId ?? ""} className={fieldCls}>
          <option value="">{t(locale, "filter.any")}</option>
          {shownMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {counted(pick(locale, `${m.nameZh} ${m.nameEn}`, m.nameEn), m.coffeeCount)}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className={labelCls}>{t(locale, "filter.price")}</legend>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            name="min"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={filter.minPriceTwd ?? ""}
            placeholder={t(locale, "filter.min")}
            aria-label={t(locale, "filter.min")}
            className={fieldCls}
          />
          <span className="text-neutral-400">–</span>
          <input
            type="number"
            name="max"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={filter.maxPriceTwd ?? ""}
            placeholder={t(locale, "filter.max")}
            aria-label={t(locale, "filter.max")}
            className={fieldCls}
          />
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="instock"
          value="1"
          defaultChecked={filter.inStock === true}
          className="h-4 w-4 accent-ink"
        />
        {t(locale, "filter.inStock")}
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          {t(locale, "filter.apply")}
        </button>
        <Link
          href="/coffees"
          className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-500"
        >
          {t(locale, "filter.reset")}
        </Link>
      </div>
    </form>
  );
}
