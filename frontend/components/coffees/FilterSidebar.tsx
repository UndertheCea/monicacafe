import Link from "next/link";
import {
  BREW_METHODS,
  ROAST_LEVELS,
  type CoffeeFilter,
  type CoffeeVariety,
  type OriginCountry,
  type ProcessingMethod,
} from "@/lib/api";
import { SEARCH_MAX_CHARS, SORT_PARAMS, brewParam, type SortParam } from "@/lib/coffeeQuery";
import { pick, t, type Locale } from "@/lib/i18n/dict";

interface Props {
  locale: Locale;
  filter: CoffeeFilter;
  sort: SortParam;
  origins: OriginCountry[];
  varieties: CoffeeVariety[];
  methods: ProcessingMethod[];
}

const fieldCls =
  "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-neutral-500";

// Plain GET form: works without JavaScript and keeps filters in the URL.
export function FilterSidebar({ locale, filter, sort, origins, varieties, methods }: Props) {
  // Group origins by region for an <optgroup> per continent.
  const regions = new Map<string, OriginCountry[]>();
  for (const o of origins) regions.set(o.region, [...(regions.get(o.region) ?? []), o]);

  return (
    <form method="get" action="/coffees" className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
      <h2 className="text-base font-bold text-ink">{t(locale, "filter.title")}</h2>

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
          {[...regions].map(([region, list]) => (
            <optgroup key={region} label={region}>
              {list.map((o) => (
                <option key={o.id} value={o.id}>
                  {pick(locale, `${o.nameZh} ${o.nameEn}`, o.nameEn)}
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
          {varieties.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.process")}</span>
        <select name="process" defaultValue={filter.processingMethodId ?? ""} className={fieldCls}>
          <option value="">{t(locale, "filter.any")}</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {pick(locale, `${m.nameZh} ${m.nameEn}`, m.nameEn)}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className={labelCls}>{t(locale, "filter.roast")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["", ...ROAST_LEVELS] as const).map((r) => (
            <label
              key={r || "any"}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-neutral-100"
            >
              <input
                type="radio"
                name="roast"
                value={r}
                defaultChecked={(filter.roastLevel ?? "") === r}
                className="accent-ink"
              />
              {r ? t(locale, `roast.${r}`) : t(locale, "filter.any")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>{t(locale, "filter.brew")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["", ...BREW_METHODS] as const).map((m) => (
            <label
              key={m || "any"}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm has-[:checked]:border-ink has-[:checked]:bg-neutral-100"
            >
              <input
                type="radio"
                name="brew"
                value={m && brewParam(m)}
                defaultChecked={(filter.brewMethod ?? "") === m}
                className="accent-ink"
              />
              {m ? t(locale, `brew.${m}`) : t(locale, "filter.any")}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-500">{t(locale, "filter.brewHint")}</p>
      </fieldset>

      <label className="block">
        <span className={labelCls}>{t(locale, "filter.flavor")}</span>
        <input
          type="search"
          name="flavor"
          defaultValue={filter.flavorNote ?? ""}
          placeholder={t(locale, "filter.flavorPlaceholder")}
          maxLength={50}
          className={fieldCls}
        />
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
