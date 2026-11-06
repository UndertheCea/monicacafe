import Link from "next/link";
import {
  ROAST_LEVELS,
  type CoffeeFilter,
  type CoffeeVariety,
  type OriginCountry,
  type ProcessingMethod,
} from "@/lib/api";
import { SORT_PARAMS, type SortParam } from "@/lib/coffeeQuery";
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
  "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-stone-500";

// Plain GET form: works without JavaScript and keeps filters in the URL.
export function FilterSidebar({ locale, filter, sort, origins, varieties, methods }: Props) {
  // Group origins by region for an <optgroup> per continent.
  const regions = new Map<string, OriginCountry[]>();
  for (const o of origins) regions.set(o.region, [...(regions.get(o.region) ?? []), o]);

  return (
    <form method="get" action="/coffees" className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="text-base font-bold text-stone-900">{t(locale, "filter.title")}</h2>

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
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2 py-1.5 text-sm has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
            >
              <input
                type="radio"
                name="roast"
                value={r}
                defaultChecked={(filter.roastLevel ?? "") === r}
                className="accent-amber-600"
              />
              {r ? t(locale, `roast.${r}`) : t(locale, "filter.any")}
            </label>
          ))}
        </div>
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
          <span className="text-stone-400">–</span>
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

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          {t(locale, "filter.apply")}
        </button>
        <Link
          href="/coffees"
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500"
        >
          {t(locale, "filter.reset")}
        </Link>
      </div>
    </form>
  );
}
